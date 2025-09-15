import React from 'react';
import { Facebook, Instagram, Twitter, Mail, Phone, MapPin } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Company Info */}
          <div>
            <h3 className="text-xl font-bold mb-4">TMAX Parts</h3>
            <p className="text-gray-400 mb-4">
              Tu tienda especializada en piezas y accesorios para Yamaha TMAX. 
              Calidad garantizada y envío rápido.
            </p>
            <div className="flex space-x-4">
              <Facebook className="h-5 w-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
              <Instagram className="h-5 w-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
              <Twitter className="h-5 w-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Enlaces Rápidos</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Sobre Nosotros</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Política de Devoluciones</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Términos y Condiciones</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Política de Privacidad</a></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Categorías</h4>
            <ul className="space-y-2">
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Sistema de Frenos</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Escape</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Suspensión</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Carrocería</a></li>
              <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Sistema Eléctrico</a></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold mb-4">Contacto</h4>
            <div className="space-y-3">
              <div className="flex items-center">
                <Phone className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-400">+34 900 123 456</span>
              </div>
              <div className="flex items-center">
                <Mail className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-400">info@tmaxparts.com</span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-gray-400">Madrid, España</span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center">
          <p className="text-gray-400">
            © 2025 TMAX Parts. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}