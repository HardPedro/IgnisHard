import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Vehicles } from './pages/Vehicles';
import { Catalog } from './pages/Catalog';
import { Quotes } from './pages/Quotes';
import { WorkOrders } from './pages/WorkOrders';
import { Leads } from './pages/Leads';
import { Settings } from './pages/Settings';
import Financial from './pages/Financial';
import { WhatsApp } from './pages/WhatsApp';
import { LandingPage } from './pages/LandingPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const ProtectedRoute = ({ children, requiredPermission }: { children: React.ReactNode, requiredPermission?: string }) => {
  const { userData, tenantData } = useAuth();
  const isGestor = userData?.role === 'Gestor' || userData?.role === 'SuperAdmin';
  const mecanicoPermissions = tenantData?.mecanicoPermissions || {};

  if (requiredPermission) {
    if (!isGestor && !mecanicoPermissions[requiredPermission]) {
      return <Navigate to="/home" replace />;
    }
  }

  return <>{children}</>;
};

function AppRoutes() {
  const { currentUser, userData, isAuthReady, logout } = useAuth();

  if (!isAuthReady) {
    return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  }

  if (userData?.unauthorized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-sm text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Acesso Restrito</h2>
          <p className="text-gray-600 mb-6">
            Sua conta ({userData.email}) ainda não foi vinculada a nenhuma oficina. 
            Por favor, peça ao administrador da sua oficina para convidar você.
          </p>
          <button
            onClick={logout}
            className="w-full py-3 px-4 bg-yellow-500 hover:bg-yellow-600 text-white font-medium rounded-xl transition-colors"
          >
            Sair e tentar com outra conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={currentUser ? <Navigate to="/home" /> : <LandingPage />} />
      <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/home" />} />
      
      {currentUser ? (
        <Route element={<Layout />}>
          <Route path="/home" element={<Home />} />
          <Route path="/dashboard" element={<ProtectedRoute requiredPermission="canViewFinancial"><Dashboard /></ProtectedRoute>} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/financial" element={<ProtectedRoute requiredPermission="canViewFinancial"><Financial /></ProtectedRoute>} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/settings" element={<ProtectedRoute requiredPermission="canEditSettings"><Settings /></ProtectedRoute>} />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" />} />
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
