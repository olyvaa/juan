import React, { useState } from 'react';
import { X, Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { shippingMethods } from '../data/products';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export default function Cart({ isOpen, onClose, onCheckout }: CartProps) {
  const { state, dispatch } = useApp();
  const [selectedShipping, setSelectedShipping] = useState(shippingMethods[0].id);

  const selectedShippingMethod = shippingMethods.find(method => method.id === selectedShipping);
  const subtotal = state.cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const total = subtotal + (selectedShippingMethod?.price || 0);

  const updateQuantity = (productId: string, quantity: number) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { productId, quantity } });
  };

  const removeFromCart = (productId: string) => {
    dispatch({ type: 'REMOVE_FROM_CART', payload: productId });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50" onClick={onClose} />

      {/* Cart Sidebar */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white shadow-xl z-50 transform transition-transform">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <ShoppingBag className="h-5 w-5 mr-2" />
              Carrito ({state.cart.length})
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="h-6 w-6" />
            </button>
          </div>

          {state.cart.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Tu carrito está vacío</p>
                <button
                  onClick={onClose}
                  className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
                >
                  Continuar comprando
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-4">
                  {state.cart.map((item) => (
                    <div key={item.product.id} className="flex items-center space-x-4 bg-gray-50 p-4 rounded-lg">
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        className="w-16 h-16 object-cover rounded-md"
                      />
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{item.product.name}</h3>
                        <p className="text-gray-600">{item.product.brand}</p>
                        <p className="text-lg font-semibold text-gray-900">
                          €{item.product.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="p-1 text-gray-500 hover:text-gray-700"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-1 text-red-500 hover:text-red-700 ml-2"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping Methods */}
                <div className="mt-8">
                  <h3 className="font-medium text-gray-900 mb-4">Método de Envío</h3>
                  <div className="space-y-3">
                    {shippingMethods.map((method) => (
                      <label key={method.id} className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="shipping"
                          value={method.id}
                          checked={selectedShipping === method.id}
                          onChange={() => setSelectedShipping(method.id)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="flex justify-between">
                            <span className="text-gray-900">{method.name}</span>
                            <span className="text-gray-900 font-medium">
                              €{method.price.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{method.description}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t p-6">
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="text-gray-900">€{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Envío:</span>
                    <span className="text-gray-900">€{selectedShippingMethod?.price.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total:</span>
                    <span>€{total.toFixed(2)}</span>
                  </div>
                </div>
                <button
                  onClick={onCheckout}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                >
                  Proceder al Pago
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}