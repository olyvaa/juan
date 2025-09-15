import React from 'react';
import { ShoppingCart, Star } from 'lucide-react';
import { Product } from '../types';
import { useApp } from '../context/AppContext';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { dispatch } = useApp();

  const handleAddToCart = () => {
    dispatch({ type: 'ADD_TO_CART', payload: product });
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
      {/* Product Image */}
      <div className="relative">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-48 object-cover"
        />
        {product.featured && (
          <div className="absolute top-2 left-2 bg-orange-500 text-white px-2 py-1 rounded-md text-xs font-semibold">
            DESTACADO
          </div>
        )}
        {product.originalPrice && (
          <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded-md text-xs font-semibold">
            OFERTA
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-4">
        <div className="mb-2">
          <span className="text-sm text-gray-500 font-medium">{product.brand}</span>
        </div>
        
        <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
          {product.name}
        </h3>
        
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {product.description}
        </p>

        {/* Rating */}
        <div className="flex items-center mb-3">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-4 w-4 fill-current text-yellow-400" />
          ))}
          <span className="text-sm text-gray-500 ml-2">(4.5)</span>
        </div>

        {/* Price */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-lg font-bold text-gray-900">
              €{product.price.toFixed(2)}
            </span>
            {product.originalPrice && (
              <span className="text-sm text-gray-500 line-through">
                €{product.originalPrice.toFixed(2)}
              </span>
            )}
          </div>
          <span className={`text-sm ${product.stock > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {product.stock > 0 ? `${product.stock} disponibles` : 'Agotado'}
          </span>
        </div>

        {/* Add to Cart Button */}
        <button
          onClick={handleAddToCart}
          disabled={product.stock === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          <ShoppingCart className="h-4 w-4" />
          <span>{product.stock === 0 ? 'Agotado' : 'Añadir al Carrito'}</span>
        </button>
      </div>
    </div>
  );
}