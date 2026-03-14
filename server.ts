import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db } from './server/firebase.js';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import path from 'path';
import Stripe from 'stripe';

let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    stripeClient = new Stripe(key, { apiVersion: '2026-02-25.clover' });
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Stripe webhook needs raw body
  app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    // Implement Stripe webhook logic here if needed
    res.json({ received: true });
  });

  app.use(express.json());

  app.post('/api/billing/checkout', async (req, res) => {
    try {
      const { priceId, tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: 'Missing tenantId' });

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/settings?success=true`,
        cancel_url: `${req.protocol}://${req.get('host')}/settings?canceled=true`,
        client_reference_id: tenantId,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error('Checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/billing/portal', async (req, res) => {
    try {
      const { tenantId } = req.body;
      if (!tenantId) return res.status(400).json({ error: 'Missing tenantId' });

      // In a real app, you would look up the Stripe Customer ID for this tenant
      // For now, we'll just return an error or a dummy URL if no customer ID exists
      // const customerId = getStripeCustomerIdForTenant(tenantId);
      
      res.status(400).json({ error: 'Portal not configured yet' });
    } catch (error: any) {
      console.error('Portal error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Z-API Webhook for incoming messages
  app.post('/webhooks/zapi', async (req, res) => {
    try {
      const data = req.body;
      console.log('Z-API Webhook received event type:', data.type || 'unknown');
      
      // Z-API payload structure
      const instanceId = data.instanceId;
      
      if (!instanceId) {
        console.log('Webhook error: Missing instanceId');
        return res.status(400).send('Missing instanceId');
      }

      // 1. Ignore status updates (delivery, read receipts) if they come to this webhook
      if (data.status && !data.messageId && !data.id) {
        console.log('Ignoring status update event');
        return res.status(200).send('OK');
      }

      // 2. Ignore events that are not messages (like connection status, presence, etc)
      if (!data.phone || (!data.messageId && !data.id)) {
        console.log('Ignoring non-message event from Z-API');
        return res.status(200).send('OK'); // Always return 200 so Z-API doesn't retry
      }

      // 3. Ignore group messages (usually we only want 1-on-1 customer service)
      if (data.isGroup || data.phone.includes('-')) {
        console.log('Ignoring group message');
        return res.status(200).send('OK');
      }

      const phone = data.phone;
      const messageId = data.messageId || data.id;
      const fromMe = data.fromMe || false;
      const type = data.type?.toLowerCase() || 'other';
      
      // Extract text robustly based on message type
      let text = '';
      if (data.text && data.text.message) {
        text = data.text.message;
      } else if (typeof data.message === 'string') {
        text = data.message;
      } else if (type === 'audio') {
        text = '🎵 Áudio recebido';
      } else if (type === 'image') {
        text = '📷 Imagem recebida';
      } else if (type === 'document') {
        text = '📄 Documento recebido';
      } else if (type === 'video') {
        text = '🎥 Vídeo recebido';
      } else if (type === 'sticker') {
        text = '🎫 Figurinha recebida';
      } else if (type === 'location') {
        text = '📍 Localização recebida';
      } else if (type === 'contacts') {
        text = '👤 Contato recebido';
      } else {
        text = `[Mensagem do tipo: ${type}]`;
      }
      
      // Find the whatsapp_number by instanceId
      const numbersRef = collection(db, 'whatsapp_numbers');
      const qNumber = query(numbersRef, where('instanceId', '==', instanceId));
      const numberSnap = await getDocs(qNumber);
      
      if (numberSnap.empty) {
        console.log(`Webhook error: Instance ${instanceId} not found in database`);
        return res.status(404).send('Instance not found');
      }
      
      const waNumber = numberSnap.docs[0];
      const tenantId = waNumber.data().tenantId;
      
      // Find or create conversation
      const convsRef = collection(db, 'whatsapp_conversations');
      const qConv = query(convsRef, 
        where('whatsapp_number_id', '==', waNumber.id),
        where('customer_phone', '==', phone)
      );
      const convSnap = await getDocs(qConv);
      
      let convId;
      if (convSnap.empty) {
        const newConv = await addDoc(convsRef, {
          tenantId,
          whatsapp_number_id: waNumber.id,
          customer_phone: phone,
          customer_name: data.senderName || data.chatName || phone,
          last_message_at: serverTimestamp(),
          bot_active: true,
          status: 'open'
        });
        convId = newConv.id;
        console.log(`Created new conversation: ${convId} for phone: ${phone}`);
      } else {
        convId = convSnap.docs[0].id;
        await updateDoc(doc(db, 'whatsapp_conversations', convId), {
          last_message_at: serverTimestamp(),
          customer_name: data.senderName || data.chatName || convSnap.docs[0].data().customer_name
        });
        console.log(`Updated conversation: ${convId} for phone: ${phone}`);
      }
      
      // Check if message already exists to prevent duplicates (Z-API sometimes retries)
      const messagesRef = collection(db, `whatsapp_conversations/${convId}/messages`);
      const qMsg = query(messagesRef, where('wa_message_id', '==', messageId));
      const msgSnap = await getDocs(qMsg);
      
      if (!msgSnap.empty) {
        console.log(`Message ${messageId} already exists, ignoring duplicate.`);
        return res.status(200).send('OK');
      }

      // Save message
      await addDoc(messagesRef, {
        tenantId,
        wa_message_id: messageId,
        direction: fromMe ? 'outbound' : 'inbound',
        type: type === 'text' ? 'text' : 'other',
        content: text,
        status: fromMe ? 'sent' : 'received',
        timestamp: serverTimestamp()
      });
      console.log(`Message saved successfully to conv ${convId}`);

      res.status(200).send('OK');
    } catch (error) {
      console.error('Z-API Webhook Error:', error);
      // Always return 200 to Z-API even on our internal errors so it doesn't keep retrying and blocking the queue
      res.status(200).send('Internal Server Error Handled');
    }
  });

  // API to send WhatsApp message via Z-API
  app.post('/api/whatsapp/messages', async (req, res) => {
    try {
      const { to, type, text, instanceId, token } = req.body;
      
      if (!to || !text || !instanceId || !token) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Fetch the Client-Token from the database
      const numbersRef = collection(db, 'whatsapp_numbers');
      const qNumber = query(numbersRef, where('instanceId', '==', instanceId));
      const numberSnap = await getDocs(qNumber);
      
      let clientToken = 'F071285c5b3d64c23945c71b69f6d3388S'; // Fallback
      if (!numberSnap.empty && numberSnap.docs[0].data().clientToken) {
        clientToken = numberSnap.docs[0].data().clientToken;
      }

      const zapiUrl = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
      
      const response = await fetch(zapiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': clientToken
        },
        body: JSON.stringify({
          phone: to,
          message: text
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Z-API Send Error:', errorData);
        return res.status(response.status).json({ error: 'Failed to send message via Z-API' });
      }

      const data = await response.json();
      res.json({ success: true, messageId: data.messageId });
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
