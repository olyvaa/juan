import React, { useState } from 'react';
import { ShoppingCart, Search, User, Menu, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface HeaderProps {
  onSearchChange: (query: string) => void;
  onShowCart: () => void;
  onShowAuth: () => void;
}

export default function Header({ onSearchChange, onShowCart, onShowAuth }: HeaderProps) {
  const { state } = useApp();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const cartItemsCount = state.cart.reduce((total, item) => total + item.quantity, 0);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(searchQuery);
  };

  return (
    <header className="bg-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <h1 className="text-2xl font-bold text-blue-700">TMAX Parts</h1>
          </div>

          {/* Search Bar - Desktop */}
          <div className="hidden md:block flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar piezas TMAX..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </form>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            <button
              onClick={onShowAuth}
              className="flex items-center space-x-2 text-gray-700 hover:text-blue-700 transition-colors"
            >
              <User className="h-5 w-5" />
              <span>{state.user ? state.user.firstName : 'Mi Cuenta'}</span>
            </button>

            <button
              onClick={onShowCart}
              className="relative flex items-center space-x-2 text-gray-700 hover:text-blue-700 transition-colors"
            >
              <ShoppingCart className="h-5 w-5" />
              <span>Carrito</span>
              {cartItemsCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {cartItemsCount}
                </span>
              )}
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-700 hover:text-blue-700"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t">
            <div className="mb-4">
              <form onSubmit={handleSearchSubmit} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar piezas TMAX..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </form>
            </div>
            
            <div className="space-y-2">
              <button
                onClick={onShowAuth}
                className="flex items-center space-x-2 w-full text-left py-2 text-gray-700 hover:text-blue-700"
              >
                <User className="h-5 w-5" />
                <span>{state.user ? state.user.firstName : 'Mi Cuenta'}</span>
              </button>

              <button
                onClick={onShowCart}
                className="flex items-center space-x-2 w-full text-left py-2 text-gray-700 hover:text-blue-700"
              >
                <ShoppingCart className="h-5 w-5" />
                <span>Carrito ({cartItemsCount})</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}