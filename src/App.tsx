import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { AppProvider } from './context/AppContext';
import Header from './components/Header';
import ProductGrid from './components/ProductGrid';
import Filters from './components/Filters';
import Cart from './components/Cart';
import AuthModal from './components/AuthModal';
import Newsletter from './components/Newsletter';
import Footer from './components/Footer';
import { useProducts } from './hooks/useProducts';
import { useApp } from './context/AppContext';

function MainContent() {
  const { products, featuredProducts, loading } = useProducts();
  const { dispatch } = useApp();
  const [showFilters, setShowFilters] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  const handleSearchChange = (query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  };

  const handleCheckout = () => {
    // In a real app, this would integrate with Stripe
    setShowCart(false);
    alert('Para implementar los pagos con Stripe, necesitas configurar tu clave secreta. Una vez configurada, podremos procesar pagos de forma segura.');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        onSearchChange={handleSearchChange}
        onShowCart={() => setShowCart(true)}
        onShowAuth={() => setShowAuth(true)}
      />

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Piezas Premium para tu TMAX
          </h1>
          <p className="text-xl md:text-2xl mb-8">
            Encuentra todo lo que necesitas para potenciar tu Yamaha TMAX
          </p>
          <div className="flex justify-center space-x-4">
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-2xl font-bold">500+</div>
              <div className="text-sm">Productos</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-2xl font-bold">24h</div>
              <div className="text-sm">Envío Express</div>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <div className="text-2xl font-bold">2 años</div>
              <div className="text-sm">Garantía</div>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Products */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          Productos Destacados
        </h2>
        <ProductGrid products={featuredProducts} />
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Todos los Productos ({products.length})
          </h2>
          <button
            onClick={() => setShowFilters(true)}
            className="lg:hidden flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Filter className="h-5 w-5" />
            <span>Filtros</span>
          </button>
        </div>

        <div className="lg:grid lg:grid-cols-4 lg:gap-8">
          {/* Filters Sidebar */}
          <div className="lg:col-span-1">
            <Filters isOpen={showFilters} onClose={() => setShowFilters(false)} />
          </div>

          {/* Products Grid */}
          <div className="lg:col-span-3">
            <ProductGrid products={products} loading={loading} />
          </div>
        </div>
      </div>

      {/* Newsletter */}
      <Newsletter />

      {/* Footer */}
      <Footer />

      {/* Cart Sidebar */}
      <Cart 
        isOpen={showCart} 
        onClose={() => setShowCart(false)}
        onCheckout={handleCheckout}
      />

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuth} 
        onClose={() => setShowAuth(false)} 
      />
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}

export default App;