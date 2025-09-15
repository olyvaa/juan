import React, { useState } from 'react';
import { Mail, CheckCircle } from 'lucide-react';

export default function Newsletter() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      // Simulate newsletter subscription
      setSubscribed(true);
      setTimeout(() => setSubscribed(false), 3000);
      setEmail('');
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-800 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Mantente al Día con TMAX Parts
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Recibe ofertas exclusivas, nuevos productos y consejos para tu TMAX
          </p>
          
          {subscribed ? (
            <div className="flex items-center justify-center text-green-300 mb-4">
              <CheckCircle className="h-6 w-6 mr-2" />
              <span className="text-lg font-medium">¡Suscripción exitosa! Gracias por unirte.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="max-w-md mx-auto flex">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Tu email..."
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-l-lg border-0 focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-r-lg transition-colors"
              >
                Suscribirse
              </button>
            </form>
          )}
          
          <p className="text-sm text-blue-200 mt-4">
            No spam, solo las mejores ofertas. Puedes darte de baja en cualquier momento.
          </p>
        </div>
      </div>
    </div>
  );
}