import { useState, useEffect, useMemo } from 'react';
import { Product } from '../types';
import { products } from '../data/products';
import { useApp } from '../context/AppContext';

export function useProducts() {
  const { state } = useApp();
  const [loading, setLoading] = useState(false);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Filter by search query
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      filtered = filtered.filter(
        product =>
          product.name.toLowerCase().includes(query) ||
          product.description.toLowerCase().includes(query) ||
          product.brand.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (state.selectedCategory && state.selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === state.selectedCategory);
    }

    // Filter by price range
    filtered = filtered.filter(
      product =>
        product.price >= state.priceRange[0] &&
        product.price <= state.priceRange[1]
    );

    return filtered;
  }, [state.searchQuery, state.selectedCategory, state.priceRange]);

  const featuredProducts = useMemo(() => {
    return products.filter(product => product.featured).slice(0, 4);
  }, []);

  // Simulate loading when filters change
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, [state.searchQuery, state.selectedCategory, state.priceRange]);

  return {
    products: filteredProducts,
    featuredProducts,
    loading
  };
}