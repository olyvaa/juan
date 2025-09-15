import { Product, ShippingMethod } from '../types';

export const products: Product[] = [
  {
    id: '1',
    name: 'Kit de Frenos TMAX 530',
    description: 'Kit completo de frenos de alto rendimiento para TMAX 530. Incluye pastillas cerámicas y discos perforados.',
    price: 289.99,
    originalPrice: 349.99,
    category: 'frenos',
    brand: 'Brembo',
    imageUrl: 'https://images.pexels.com/photos/190574/pexels-photo-190574.jpeg?auto=compress&cs=tinysrgb&w=600',
    stock: 15,
    featured: true,
    specifications: {
      'Compatibilidad': 'TMAX 530 (2012-2016)',
      'Material': 'Acero inoxidable',
      'Tipo': 'Perforado y ventilado'
    }
  },
  {
    id: '2',
    name: 'Escape Akrapovic TMAX 560',
    description: 'Sistema de escape deportivo Akrapovic para TMAX 560. Mejora potencia y sonido.',
    price: 699.99,
    category: 'escape',
    brand: 'Akrapovic',
    imageUrl: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=600',
    stock: 8,
    featured: true,
    specifications: {
      'Compatibilidad': 'TMAX 560 (2020+)',
      'Material': 'Titanio',
      'Ganancia de potencia': '+5HP'
    }
  },
  {
    id: '3',
    name: 'Filtro de Aire K&N TMAX',
    description: 'Filtro de aire deportivo reutilizable K&N. Mayor flujo de aire y mejor rendimiento.',
    price: 79.99,
    category: 'motor',
    brand: 'K&N',
    imageUrl: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=600',
    stock: 25,
    featured: false,
    specifications: {
      'Compatibilidad': 'TMAX 530/560',
      'Material': 'Algodón',
      'Lavable': 'Sí'
    }
  },
  {
    id: '4',
    name: 'Amortiguadores Öhlins TMAX',
    description: 'Par de amortiguadores traseros Öhlins para TMAX. Ajuste de precarga y rebote.',
    price: 1299.99,
    category: 'suspension',
    brand: 'Öhlins',
    imageUrl: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=600',
    stock: 5,
    featured: true,
    specifications: {
      'Compatibilidad': 'TMAX 530/560',
      'Ajustes': '36 posiciones',
      'Color': 'Dorado/Negro'
    }
  },
  {
    id: '5',
    name: 'Cúpula Sport TMAX',
    description: 'Cúpula deportiva ahumada para TMAX. Mejora la aerodinámica y el estilo.',
    price: 159.99,
    category: 'carroceria',
    brand: 'Puig',
    imageUrl: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=600',
    stock: 12,
    featured: false,
    specifications: {
      'Compatibilidad': 'TMAX 560 (2020+)',
      'Color': 'Ahumado',
      'Material': 'Policarbonato'
    }
  },
  {
    id: '6',
    name: 'Kit LED TMAX',
    description: 'Kit completo de luces LED para TMAX. Faros, intermitentes y luces traseras.',
    price: 299.99,
    category: 'electrico',
    brand: 'Osram',
    imageUrl: 'https://images.pexels.com/photos/3806288/pexels-photo-3806288.jpeg?auto=compress&cs=tinysrgb&w=600',
    stock: 18,
    featured: false,
    specifications: {
      'Compatibilidad': 'TMAX 530/560',
      'Potencia': '6000K',
      'Vida útil': '50.000 horas'
    }
  }
];

export const categories = [
  { id: 'all', name: 'Todas las categorías' },
  { id: 'frenos', name: 'Sistema de Frenos' },
  { id: 'escape', name: 'Escape' },
  { id: 'motor', name: 'Motor' },
  { id: 'suspension', name: 'Suspensión' },
  { id: 'carroceria', name: 'Carrocería' },
  { id: 'electrico', name: 'Sistema Eléctrico' }
];

export const shippingMethods: ShippingMethod[] = [
  {
    id: 'standard',
    name: 'Envío Estándar',
    description: 'Entrega en 3-5 días laborables',
    price: 9.99,
    estimatedDays: 4
  },
  {
    id: 'express',
    name: 'Envío Express',
    description: 'Entrega en 1-2 días laborables',
    price: 19.99,
    estimatedDays: 2
  },
  {
    id: 'premium',
    name: 'Envío Premium',
    description: 'Entrega en 24 horas',
    price: 29.99,
    estimatedDays: 1
  }
];