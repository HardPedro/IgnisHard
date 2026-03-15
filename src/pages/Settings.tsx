import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Terminal, Key, Shield, Users, Plus, X, Trash2, RefreshCw, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';



export function Settings() {
  const { currentUser, userData } = useAuth();
  const [isDevAreaOpen, setIsDevAreaOpen] = useState(false);
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [zapiUrl, setZapiUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [generalSaveMessage, setGeneralSaveMessage] = useState('');
  
  // General settings state
  const [officeSettings, setOfficeSettings] = useState({
    name: '',
    cnpj: '',
    address: '',
    phone: '',
    logo_url: '',
    mecanicoPermissions: {
      canViewFinancial: false,
      canDeleteOS: false,
      canEditSettings: false
    }
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  
  // Team state
  const [team, setTeam] = useState<any[]>([]);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'Mecanico' });
  
  // Admin state
  const [user, setUser] = useState<any>(null);
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  
  // New account form state
  const [newAccount, setNewAccount] = useState({
    companyName: '',
    email: '',
    name: '',
    plan: 'Core Operacional'
  });
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [updatingPlanId, setUpdatingPlanId] = useState<string | null>(null);

  useEffect(() => {
    // Load saved settings
    const savedInstanceId = localStorage.getItem('zapi_instance_id') || '';
    const savedToken = localStorage.getItem('zapi_token') || '';
    const savedClientToken = localStorage.getItem('zapi_client_token') || '';
    const savedUrl = localStorage.getItem('zapi_url') || '';
    setZapiInstanceId(savedInstanceId);
    setZapiToken(savedToken);
    setZapiClientToken(savedClientToken);
    setZapiUrl(savedUrl);
    
    if (userData) {
      setUser(userData);
      fetchOfficeSettings();
      fetchTeam();
    }
  }, [userData]);

  const fetchTeam = async () => {
    if (!userData?.tenantId) return;
    try {
      const q = query(collection(db, 'users'), where('tenantId', '==', userData.tenantId));
      const querySnapshot = await getDocs(q);
      const teamData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTeam(teamData);
    } catch (error) {
      console.error('Failed to fetch team', error);
    }
  };

  const handleCreateTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;
    try {
      // Create a new user document with the email and tenantId
      // When the user logs in with Google, AuthContext will link this document
      const newUserId = 'u-' + Date.now();
      await setDoc(doc(db, 'users', newUserId), {
        tenantId: userData.tenantId,
        email: newMember.email,
        name: newMember.name,
        role: newMember.role,
        createdAt: new Date().toISOString()
      });
      
      setIsTeamModalOpen(false);
      setNewMember({ name: '', email: '', role: 'Mecanico' });
      fetchTeam();
    } catch (error) {
      console.error('Failed to create team member', error);
      alert('Erro ao criar membro da equipe');
    }
  };

  const handleDeleteTeamMember = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este membro da equipe?')) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      fetchTeam();
    } catch (error) {
      console.error('Failed to delete team member', error);
    }
  };

  const fetchOfficeSettings = async () => {
    if (!userData?.tenantId) return;
    setIsLoadingSettings(true);
    try {
      const docRef = doc(db, 'tenants', userData.tenantId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOfficeSettings({
          name: data.name || '',
          cnpj: data.cnpj || '',
          address: data.address || '',
          phone: data.phone || '',
          logo_url: data.logo_url || '',
          mecanicoPermissions: data.mecanicoPermissions || {
            canViewFinancial: false,
            canDeleteOS: false,
            canEditSettings: false
          }
        });
      }
    } catch (error) {
      console.error('Failed to fetch office settings', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveGeneralSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'tenants', userData.tenantId), officeSettings);
      setGeneralSaveMessage('Configurações salvas com sucesso!');
      setTimeout(() => setGeneralSaveMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save general settings', error);
      alert('Erro de conexão ao salvar configurações');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDevSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.tenantId) {
      setSaveMessage('Erro: Usuário não possui uma oficina (tenantId) vinculada.');
      return;
    }
    setIsSaving(true);
    
    // Save to localStorage for MVP purposes
    localStorage.setItem('zapi_instance_id', zapiInstanceId);
    localStorage.setItem('zapi_token', zapiToken);
    localStorage.setItem('zapi_client_token', zapiClientToken);
    localStorage.setItem('zapi_url', zapiUrl);
    
    try {
      const finalInstanceId = zapiInstanceId.trim();
      if (!finalInstanceId) throw new Error('ID da Instância é obrigatório.');
      if (finalInstanceId.includes('/')) throw new Error('ID da Instância inválido. Use o campo "API da Instância" para colar a URL completa.');
      
      // Register the number in the backend so the webhook can find it
      await setDoc(doc(db, `whatsapp_numbers`, finalInstanceId), {
        tenantId: userData.tenantId,
        instanceId: finalInstanceId,
        token: zapiToken,
        clientToken: zapiClientToken,
        phone_number: 'Z-API Instance',
        updatedAt: new Date().toISOString()
      });
      
      setIsSaving(false);
      setSaveMessage('Configurações salvas com sucesso!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error: any) {
      console.error('Failed to save Z-API settings to backend', error);
      setIsSaving(false);
      setSaveMessage(error.message || 'Erro ao salvar no servidor.');
    }
  };

  const handleRegister360Webhook = async () => {
    alert('Webhook configuration is handled by the backend. Please ensure your Z-API or Evolution API is configured to point to your server URL.');
  };

  const loadAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const tenantsSnapshot = await getDocs(collection(db, 'tenants'));
      const usersSnapshot = await getDocs(collection(db, 'users'));
      
      const usersData = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      const accountsData = tenantsSnapshot.docs.map(doc => {
        const tenantData = doc.data();
        // Find the Gestor for this tenant
        const gestor = usersData.find(u => u.tenantId === doc.id && u.role === 'Gestor');
        
        return { 
          id: doc.id, 
          name: tenantData.name,
          plan: tenantData.plan,
          createdAt: tenantData.createdAt,
          email: gestor ? gestor.email : 'Sem Gestor',
          gestorName: gestor ? gestor.name : '-'
        };
      });
      setAccounts(accountsData);
    } catch (error) {
      console.error('Failed to load accounts', error);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleOpenAccountsModal = () => {
    setIsAccountsModalOpen(true);
    loadAccounts();
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingAccount(true);
    try {
      const tenantId = 't-' + Date.now();
      await setDoc(doc(db, 'tenants', tenantId), {
        name: newAccount.companyName,
        plan: newAccount.plan,
        createdAt: new Date().toISOString()
      });
      
      const newUserId = 'u-' + Date.now();
      await setDoc(doc(db, 'users', newUserId), {
        tenantId,
        email: newAccount.email,
        name: newAccount.name,
        role: 'Gestor',
        createdAt: new Date().toISOString()
      });
      
      setNewAccount({ companyName: '', email: '', name: '', plan: 'Core Operacional' });
      loadAccounts();
    } catch (error) {
      console.error('Failed to create account', error);
      alert('Erro ao criar conta');
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleDeleteAccount = async (tenantId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta conta? Esta ação não pode ser desfeita.')) return;
    
    try {
      await deleteDoc(doc(db, 'tenants', tenantId));
      loadAccounts();
    } catch (error) {
      console.error('Failed to delete account', error);
      alert('Erro ao excluir conta');
    }
  };

  const handleUpdatePlan = async (tenantId: string, plan: string) => {
    setUpdatingPlanId(tenantId);
    try {
      await updateDoc(doc(db, 'tenants', tenantId), { plan });
      loadAccounts();
    } catch (error) {
      console.error('Failed to update plan', error);
      alert('Erro ao atualizar plano');
    } finally {
      setUpdatingPlanId(null);
    }
  };

  const isSuperAdmin = userData?.email === 'harddisk1911@gmail.com';
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <SettingsIcon className="mr-3 h-8 w-8 text-yellow-500" />
          Configurações
        </h1>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('general')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'general'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Geral
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'team'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Equipe
          </button>
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'whatsapp'
                ? 'border-yellow-500 text-yellow-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            WhatsApp
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'admin'
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Admin
            </button>
          )}
        </nav>
      </div>

      {activeTab === 'general' && (
        <div className="bg-white shadow-sm sm:rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Configurações Gerais</h2>
            
            <form onSubmit={handleSaveGeneralSettings} className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Oficina</label>
                  <input 
                    type="text" 
                    value={officeSettings.name}
                    onChange={e => setOfficeSettings({...officeSettings, name: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
                  <input 
                    type="text" 
                    value={officeSettings.cnpj}
                    onChange={e => setOfficeSettings({...officeSettings, cnpj: e.target.value})}
                    placeholder="00.000.000/0000-00"
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input 
                    type="text" 
                    value={officeSettings.phone}
                    onChange={e => setOfficeSettings({...officeSettings, phone: e.target.value})}
                    placeholder="(00) 00000-0000"
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                  <input 
                    type="text" 
                    value={officeSettings.logo_url}
                    onChange={e => setOfficeSettings({...officeSettings, logo_url: e.target.value})}
                    placeholder="https://exemplo.com/logo.png"
                    className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                <textarea 
                  rows={2}
                  value={officeSettings.address}
                  onChange={e => setOfficeSettings({...officeSettings, address: e.target.value})}
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors" 
                />
              </div>

              <div className="pt-4 flex items-center">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
                {generalSaveMessage && (
                  <span className="ml-4 text-sm text-green-600 font-medium flex items-center">
                    {generalSaveMessage}
                  </span>
                )}
              </div>
            </form>
          </div>
          
          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100 flex justify-end">
            <button 
              onClick={() => setIsDevAreaOpen(!isDevAreaOpen)}
              className="text-xs font-mono text-gray-500 hover:text-gray-900 flex items-center transition-colors"
            >
              <Terminal className="h-3 w-3 mr-1" />
              Área DEV
            </button>
          </div>
        </div>
      )}

      {activeTab === 'team' && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Gestão da Equipe</h2>
            <button 
              onClick={() => setIsTeamModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all"
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Membro
            </button>
          </div>

          <div className="overflow-hidden border border-gray-100 rounded-2xl mb-8">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">E-mail</th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Cargo</th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {team.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{member.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{member.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        member.role === 'Gestor' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {member.id !== user?.id && (
                        <button 
                          onClick={() => handleDeleteTeamMember(member.id)}
                          className="text-red-600 hover:text-red-900 p-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 border-t border-gray-100 pt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Permissões do Perfil: Mecânico</h3>
            <p className="text-sm text-gray-500 mb-6">Configure o que os usuários com o perfil de Mecânico podem acessar ou modificar no sistema.</p>
            
            <div className="space-y-4 max-w-2xl">
              <label className="flex items-center space-x-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={officeSettings.mecanicoPermissions.canViewFinancial}
                  onChange={e => setOfficeSettings({
                    ...officeSettings, 
                    mecanicoPermissions: { ...officeSettings.mecanicoPermissions, canViewFinancial: e.target.checked }
                  })}
                  className="h-5 w-5 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Acessar Financeiro</span>
                  <span className="block text-xs text-gray-500">Permite visualizar relatórios financeiros, fluxo de caixa e faturamento.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={officeSettings.mecanicoPermissions.canDeleteOS}
                  onChange={e => setOfficeSettings({
                    ...officeSettings, 
                    mecanicoPermissions: { ...officeSettings.mecanicoPermissions, canDeleteOS: e.target.checked }
                  })}
                  className="h-5 w-5 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Excluir Ordens de Serviço</span>
                  <span className="block text-xs text-gray-500">Permite apagar ordens de serviço do sistema permanentemente.</span>
                </div>
              </label>

              <label className="flex items-center space-x-3 p-4 border border-gray-100 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                <input 
                  type="checkbox" 
                  checked={officeSettings.mecanicoPermissions.canEditSettings}
                  onChange={e => setOfficeSettings({
                    ...officeSettings, 
                    mecanicoPermissions: { ...officeSettings.mecanicoPermissions, canEditSettings: e.target.checked }
                  })}
                  className="h-5 w-5 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">Editar Configurações</span>
                  <span className="block text-xs text-gray-500">Permite alterar dados da oficina, integrações e configurações gerais.</span>
                </div>
              </label>
            </div>

            <div className="mt-6">
              <button 
                onClick={handleSaveGeneralSettings}
                disabled={isSaving}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Salvando...' : 'Salvar Permissões'}
              </button>
              {generalSaveMessage && (
                <span className="ml-4 text-sm text-green-600 font-medium inline-flex items-center">
                  {generalSaveMessage}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'whatsapp' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">WhatsApp API (Z-API)</h2>
            <form onSubmit={handleSaveDevSettings} className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API da Instância (URL Completa)</label>
                <input 
                  type="text" 
                  value={zapiUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setZapiUrl(url);
                    const match = url.match(/instances\/([^\/]+)\/token\/([^\/]+)/);
                    if (match) {
                      setZapiInstanceId(match[1]);
                      setZapiToken(match[2].replace(/\/$/, '')); // Remove trailing slash if exists
                    }
                  }}
                  placeholder="Ex: https://api.z-api.io/instances/3F00.../token/3199..."
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                />
                <p className="text-xs text-gray-500 mt-1">Cole a URL completa aqui e nós extraímos o ID e o Token automaticamente.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID da Instância</label>
                  <input 
                    type="text" 
                    value={zapiInstanceId}
                    onChange={e => setZapiInstanceId(e.target.value)}
                    readOnly
                    className="block w-full bg-gray-50 border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none sm:text-sm text-gray-500 font-mono" 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Token da Instância</label>
                  <input 
                    type="password" 
                    value={zapiToken}
                    onChange={e => setZapiToken(e.target.value)}
                    readOnly
                    className="block w-full bg-gray-50 border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none sm:text-sm text-gray-500 font-mono" 
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Token de Segurança (Client-Token)</label>
                <input 
                  type="password" 
                  value={zapiClientToken}
                  onChange={e => setZapiClientToken(e.target.value)}
                  placeholder="Opcional, usado para enviar mensagens"
                  className="block w-full border border-gray-300 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                />
                <p className="text-xs text-gray-500 mt-1">Encontrado no painel da Z-API em Segurança {'>'} Token de Segurança.</p>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-4">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 transition-all duration-200 disabled:opacity-50"
                >
                  <Save className="mr-2 h-4 w-4" />
                  {isSaving ? 'Salvando...' : 'Salvar Configurações API'}
                </button>
              </div>
              {saveMessage && (
                <p className={`text-sm font-medium ${saveMessage.includes('Erro') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage}
                </p>
              )}
            </form>
          </div>

          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm mt-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">URLs de Webhook</h2>
            <p className="text-sm text-gray-500 mb-6">
              Copie as URLs abaixo e cole nas configurações do seu provedor (Z-API ou Stripe) para receber os eventos em tempo real.
            </p>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Webhook do WhatsApp (Z-API)</label>
                <div className="flex items-center">
                  <input 
                    type="text" 
                    readOnly
                    value={`${window.location.origin}/webhooks/zapi`}
                    className="block w-full bg-gray-50 border border-gray-300 rounded-l-xl shadow-sm py-3 px-4 text-gray-600 focus:outline-none sm:text-sm font-mono" 
                  />
                  <button 
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/webhooks/zapi`);
                      alert('URL do Z-API copiada para a área de transferência!');
                    }}
                    className="inline-flex items-center px-4 py-3 border border-l-0 border-gray-300 text-sm font-bold rounded-r-xl shadow-sm text-gray-700 bg-white hover:bg-gray-50 transition-all"
                  >
                    Copiar
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Configure esta URL na Z-API para receber as mensagens dos clientes.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          </div>
        </div>
      )}

      {activeTab === 'admin' && isSuperAdmin && (
        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Painel de Administração (SuperAdmin)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-2">Gerenciar Contas</h3>
              <p className="text-sm text-gray-500 mb-4">Visualize, crie e gerencie todas as oficinas cadastradas no sistema.</p>
              <button 
                onClick={handleOpenAccountsModal}
                className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all"
              >
                <Users className="mr-2 h-4 w-4" />
                Ver Todas as Contas
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isDevAreaOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gray-900 shadow-sm sm:rounded-2xl border border-gray-800 overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center">
                  <Terminal className="h-6 w-6 text-yellow-500 mr-3" />
                  <h2 className="text-xl font-semibold text-white">Área do Desenvolvedor</h2>
                </div>
                <div className="flex items-center space-x-4">
                  {isSuperAdmin && (
                    <button
                      onClick={handleOpenAccountsModal}
                      className="bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-sm font-bold px-4 py-2 rounded-xl flex items-center transition-colors"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Administrar Contas
                    </button>
                  )}
                  <span className="bg-red-500/10 text-red-400 text-xs font-bold px-3 py-1 rounded-full flex items-center">
                    <Shield className="h-3 w-3 mr-1" />
                    Zona de Perigo
                  </span>
                </div>
              </div>
              
              <div className="p-8">
                <div className="mb-6 bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                  <h3 className="text-sm font-medium text-gray-300 mb-2 flex items-center">
                    <Key className="h-4 w-4 mr-2 text-yellow-500" />
                    Integração WhatsApp via Z-API
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Insira suas credenciais da Z-API para habilitar o envio e recebimento de mensagens.
                    O sistema utilizará essas chaves para se comunicar com a instância do WhatsApp.
                  </p>
                </div>

                <form onSubmit={handleSaveDevSettings} className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">ID da Instância</label>
                    <input 
                      type="text" 
                      value={zapiInstanceId}
                      onChange={(e) => setZapiInstanceId(e.target.value)}
                      placeholder="Ex: 3F00CCD5AE7541FFFB8086C84BA70"
                      className="block w-full bg-gray-800 border border-gray-700 rounded-xl shadow-sm py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Token da Instância</label>
                    <input 
                      type="password" 
                      value={zapiToken}
                      onChange={(e) => setZapiToken(e.target.value)}
                      placeholder="Ex: 3199E688571927B4B2352F44"
                      className="block w-full bg-gray-800 border border-gray-700 rounded-xl shadow-sm py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Token de Segurança (Client-Token)</label>
                    <input 
                      type="password" 
                      value={zapiClientToken}
                      onChange={(e) => setZapiClientToken(e.target.value)}
                      placeholder="Opcional, usado para enviar mensagens"
                      className="block w-full bg-gray-800 border border-gray-700 rounded-xl shadow-sm py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm transition-colors font-mono" 
                    />
                  </div>

                  <div className="pt-4 flex items-center space-x-4">
                    <button 
                      type="submit"
                      disabled={isSaving}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-bold rounded-xl shadow-sm text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-yellow-500 transition-all duration-200 disabled:opacity-50"
                    >
                      {isSaving ? 'Salvando...' : 'Salvar Credenciais'}
                    </button>
                    
                    <button 
                      type="button"
                      onClick={handleRegister360Webhook}
                      className="inline-flex items-center px-4 py-2 border border-gray-600 text-sm font-bold rounded-xl shadow-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-gray-500 transition-all duration-200"
                    >
                      Configurar Webhook 360dialog
                    </button>
                    
                    {saveMessage && (
                      <span className="text-sm text-green-400 flex items-center">
                        {saveMessage}
                      </span>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Team Modal */}
      <AnimatePresence>
        {isTeamModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] p-8 w-full max-w-md shadow-2xl border border-gray-100"
            >
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Novo Membro da Equipe</h3>
              <form onSubmit={handleCreateTeamMember} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input 
                    type="text" 
                    required
                    value={newMember.name}
                    onChange={e => setNewMember({...newMember, name: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail (Google)</label>
                  <input 
                    type="email" 
                    required
                    value={newMember.email}
                    onChange={e => setNewMember({...newMember, email: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <select 
                    value={newMember.role}
                    onChange={e => setNewMember({...newMember, role: e.target.value})}
                    className="block w-full border border-gray-300 rounded-xl py-3 px-4 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm"
                  >
                    <option value="Mecanico">Mecânico</option>
                    <option value="Gestor">Gestor</option>
                  </select>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="submit" className="flex-1 bg-yellow-500 text-gray-900 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-all">
                    Criar Membro
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsTeamModalOpen(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Accounts Modal */}
      <AnimatePresence>
        {isAccountsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <Users className="h-5 w-5 mr-2 text-yellow-500" />
                  Administrar Contas (Estabelecimentos)
                </h2>
                <button 
                  onClick={() => setIsAccountsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
                {/* Create Account Form */}
                <div className="w-full md:w-1/3 space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Nova Conta</h3>
                  <form onSubmit={handleCreateAccount} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Estabelecimento</label>
                      <input 
                        type="text" 
                        required
                        value={newAccount.companyName}
                        onChange={e => setNewAccount({...newAccount, companyName: e.target.value})}
                        className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Responsável</label>
                      <input 
                        type="text" 
                        required
                        value={newAccount.name}
                        onChange={e => setNewAccount({...newAccount, name: e.target.value})}
                        className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">E-mail do Gestor (Google)</label>
                      <input 
                        type="email" 
                        required
                        value={newAccount.email}
                        onChange={e => setNewAccount({...newAccount, email: e.target.value})}
                        className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plano</label>
                      <select 
                        required
                        value={newAccount.plan}
                        onChange={e => setNewAccount({...newAccount, plan: e.target.value})}
                        className="block w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 focus:ring-yellow-500 focus:border-yellow-500 sm:text-sm" 
                      >
                        <option value="Core Operacional">Core Operacional (R$ 397)</option>
                        <option value="Central Inteligente">Central Inteligente (R$ 697)</option>
                      </select>
                    </div>
                    <button 
                      type="submit"
                      disabled={isCreatingAccount}
                      className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-gray-900 bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                    >
                      {isCreatingAccount ? 'Criando...' : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Criar Conta
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Accounts List */}
                <div className="w-full md:w-2/3">
                  <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 mb-4">Contas Ativas</h3>
                  {isLoadingAccounts ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estabelecimento</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plano</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {accounts.map((acc) => {
                            return (
                            <tr key={acc.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{acc.name}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{acc.email}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {acc.email !== 'harddisk1911@gmail.com' ? (
                                  <select
                                    value={acc.plan || 'Core Operacional'}
                                    onChange={(e) => handleUpdatePlan(acc.id, e.target.value)}
                                    disabled={updatingPlanId === acc.id}
                                    className="block w-full border border-gray-300 rounded-lg shadow-sm py-1 px-2 focus:ring-yellow-500 focus:border-yellow-500 sm:text-xs"
                                  >
                                    <option value="Core Operacional">Core Operacional</option>
                                    <option value="Central Inteligente">Central Inteligente</option>
                                  </select>
                                ) : (
                                  <span className="px-2 py-1 inline-flex text-xs leading-4 font-semibold rounded-full bg-gray-100 text-gray-800">
                                    Admin
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {new Date(acc.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                {acc.email !== 'harddisk1911@gmail.com' && (
                                  <div className="flex justify-end space-x-2">
                                    <button 
                                      onClick={() => handleDeleteAccount(acc.id)}
                                      className="text-red-600 hover:text-red-900 transition-colors"
                                      title="Excluir conta"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )})}
                          {accounts.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                                Nenhuma conta encontrada.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
