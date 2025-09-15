import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Product, CartItem, User } from '../types';

interface AppState {
  cart: CartItem[];
  user: User | null;
  searchQuery: string;
  selectedCategory: string;
  priceRange: [number, number];
}

type AppAction = 
  | { type: 'ADD_TO_CART'; payload: Product }
  | { type: 'REMOVE_FROM_CART'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { productId: string; quantity: number } }
  | { type: 'CLEAR_CART' }
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_CATEGORY'; payload: string }
  | { type: 'SET_PRICE_RANGE'; payload: [number, number] };

const initialState: AppState = {
  cart: [],
  user: null,
  searchQuery: '',
  selectedCategory: 'all',
  priceRange: [0, 1000]
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_TO_CART': {
      const existingItem = state.cart.find(item => item.product.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          cart: state.cart.map(item =>
            item.product.id === action.payload.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        };
      }
      return {
        ...state,
        cart: [...state.cart, { product: action.payload, quantity: 1 }]
      };
    }
    case 'REMOVE_FROM_CART':
      return {
        ...state,
        cart: state.cart.filter(item => item.product.id !== action.payload)
      };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        cart: state.cart.map(item =>
          item.product.id === action.payload.productId
            ? { ...item, quantity: Math.max(0, action.payload.quantity) }
            : item
        ).filter(item => item.quantity > 0)
      };
    case 'CLEAR_CART':
      return { ...state, cart: [] };
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.payload };
    case 'SET_PRICE_RANGE':
      return { ...state, priceRange: action.payload };
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}