import React from 'react';
import { Filter, X } from 'lucide-react';
import { categories } from '../data/products';
import { useApp } from '../context/AppContext';

interface FiltersProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Filters({ isOpen, onClose }: FiltersProps) {
  const { state, dispatch } = useApp();

  const handleCategoryChange = (categoryId: string) => {
    dispatch({ type: 'SET_CATEGORY', payload: categoryId });
  };

  const handlePriceRangeChange = (min: number, max: number) => {
    dispatch({ type: 'SET_PRICE_RANGE', payload: [min, max] });
  };

  const resetFilters = () => {
    dispatch({ type: 'SET_CATEGORY', payload: 'all' });
    dispatch({ type: 'SET_PRICE_RANGE', payload: [0, 1000] });
    dispatch({ type: 'SET_SEARCH_QUERY', payload: '' });
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />
      )}

      {/* Filters Sidebar */}
      <div className={`
        fixed lg:relative lg:block
        top-0 left-0 h-full lg:h-auto
        w-80 lg:w-64
        bg-white lg:bg-transparent
        shadow-xl lg:shadow-none
        z-50 lg:z-auto
        transform lg:transform-none transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6 lg:p-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 lg:hidden">
            <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="hidden lg:flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filtros
            </h2>
            <button
              onClick={resetFilters}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Limpiar
            </button>
          </div>

          {/* Categories */}
          <div className="mb-8">
            <h3 className="font-medium text-gray-900 mb-4">Categorías</h3>
            <div className="space-y-3">
              {categories.map((category) => (
                <label key={category.id} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="category"
                    value={category.id}
                    checked={state.selectedCategory === category.id}
                    onChange={() => handleCategoryChange(category.id)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-gray-700">{category.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div className="mb-8">
            <h3 className="font-medium text-gray-900 mb-4">Rango de Precio</h3>
            <div className="space-y-3">
              {[
                { min: 0, max: 50, label: 'Menos de €50' },
                { min: 50, max: 100, label: '€50 - €100' },
                { min: 100, max: 300, label: '€100 - €300' },
                { min: 300, max: 600, label: '€300 - €600' },
                { min: 600, max: 1000, label: 'Más de €600' }
              ].map((range) => (
                <label key={`${range.min}-${range.max}`} className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="priceRange"
                    checked={
                      state.priceRange[0] === range.min && 
                      state.priceRange[1] === range.max
                    }
                    onChange={() => handlePriceRangeChange(range.min, range.max)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-gray-700">{range.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Brands */}
          <div className="mb-8">
            <h3 className="font-medium text-gray-900 mb-4">Marcas</h3>
            <div className="space-y-3">
              {['Brembo', 'Akrapovic', 'K&N', 'Öhlins', 'Puig', 'Osram'].map((brand) => (
                <label key={brand} className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="text-blue-600 focus:ring-blue-500 rounded"
                  />
                  <span className="ml-3 text-gray-700">{brand}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}