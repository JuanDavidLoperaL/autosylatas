import { useState } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'
import logo from '../assets/logo.png'

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="landing">

      {/* ── HEADER ── */}
      <header className="landing-header">
        <div className="container header-inner">
          <img src={logo} alt="Autos y Latas" className="header-logo" />

          {/* Nav desktop */}
          <nav>
            <a href="#nosotros">Nosotros</a>
            <a href="#ubicacion">Ubicación</a>
            <a href="#contacto">Contacto</a>
            <Link to="/login" className="btn-login">Ingresar</Link>
          </nav>

          {/* Hamburger mobile */}
          <button
            className="hamburger"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menú"
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        {/* Mobile menu */}
        <div className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
          <a href="#nosotros" onClick={closeMenu}>Nosotros</a>
          <a href="#ubicacion" onClick={closeMenu}>Ubicación</a>
          <a href="#contacto" onClick={closeMenu}>Contacto</a>
          <Link to="/login" onClick={closeMenu}>Ingresar →</Link>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-overlay" />
        <div className="container hero-content">
          <img src={logo} alt="Autos y Latas" className="hero-logo" />
          <h2>Taxis nuevos · Repuestos de segunda</h2>
          <p>Tu aliado en Medellín para encontrar la pieza que necesitas al mejor precio</p>
          <div className="hero-buttons">
            <a href="#contacto" className="btn-primary">Contáctanos</a>
            <a href="#ubicacion" className="btn-secondary">Ver ubicación</a>
          </div>
        </div>
      </section>

      {/* ── NOSOTROS ── */}
      <section id="nosotros" className="section">
        <div className="container">
          <div className="section-title">
            <span className="gold-line" />
            <h2>¿Quiénes somos?</h2>
            <span className="gold-line" />
          </div>

          {/* Historia */}
          <div className="historia-block">
            <div className="historia-badge">
              <span className="badge-year">2004</span>
              <span className="badge-label">Fundados en Medellín</span>
            </div>
            <p className="historia-texto">
              Desde el año <strong>2004</strong>, Autos &amp; Latas ha sido el aliado de confianza de
              talleres, mecánicos y particulares en Medellín. Más de <strong>20 años</strong> de
              experiencia nos respaldan como el negocio <strong>número 1 en nuestro sector</strong>,
              ofreciendo repuestos usados de calidad, documentados y a los mejores precios del mercado.
              Somos un negocio familiar que creció con dedicación, honestidad y el compromiso de siempre
              darle al cliente la mejor solución para su vehículo.
            </p>
          </div>

          {/* Cards principales */}
          <div className="cards">
            <div className="card">
              <span className="card-icon">🏆</span>
              <h3>Número 1 del sector</h3>
              <p>Más de 20 años de trayectoria nos posicionan como el referente de repuestos usados en La Candelaria, Medellín.</p>
            </div>
            <div className="card">
              <span className="card-icon">🔩</span>
              <h3>Amplio inventario</h3>
              <p>Motor, caja, carrocería, suspensión, electricidad y más. Si no lo tenemos, lo conseguimos.</p>
            </div>
            <div className="card">
              <span className="card-icon">💰</span>
              <h3>Precios imbatibles</h3>
              <p>Nuestros precios son de los mejores en el mercado. Ahorra significativamente sin sacrificar calidad.</p>
            </div>
            <div className="card">
              <span className="card-icon">🚛</span>
              <h3>Envíos a todo el país</h3>
              <p>¿Estás en otra ciudad? No hay problema. Enviamos repuestos a cualquier rincón de Colombia.</p>
            </div>
            <div className="card">
              <span className="card-icon">✅</span>
              <h3>Con garantía</h3>
              <p>Dependiendo de la pieza, ofrecemos garantía. Tu inversión está protegida con nosotros.</p>
            </div>
            <div className="card">
              <span className="card-icon">🚕</span>
              <h3>Taxis nuevos</h3>
              <p>Vendemos taxis nuevos en Medellín y Sabaneta. Consulta disponibilidad y financiación.</p>
            </div>
          </div>

          {/* Bloque SIJIN */}
          <div className="sijin-block">
            <div className="sijin-icon">🛡️</div>
            <div className="sijin-content">
              <h3>Documentación al día · Certificado SIJIN</h3>
              <p>
                Todos nuestros repuestos cuentan con <strong>documentación completa y verificada</strong>.
                Trabajamos con certificación de la <strong>SIJIN</strong> que garantiza que cada pieza
                es de buena procedencia — <em>no hurtada, no ilegal, sin problemas legales de ningún tipo</em>.
                Compra con total tranquilidad y respaldo legal.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── UBICACION ── */}
      <section id="ubicacion" className="section section-dark">
        <div className="container">
          <div className="section-title">
            <span className="gold-line" />
            <h2>¿Dónde encontrarnos?</h2>
            <span className="gold-line" />
          </div>
          <div className="ubicacion-grid">
            <div className="ubicacion-info">
              <div className="info-item">
                <span className="info-icon">📍</span>
                <div>
                  <strong>Dirección</strong>
                  <p>Av. Ayacucho #5795, La Candelaria<br />Medellín, Antioquia</p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon">⏰</span>
                <div>
                  <strong>Horario</strong>
                  <p>Lunes a Sábado<br />8:00 am – 6:00 pm</p>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon">📞</span>
                <div>
                  <strong>Teléfono fijo</strong>
                  <a href="tel:6044236794">604 423 6794</a>
                </div>
              </div>
              <div className="info-item">
                <span className="info-icon">📱</span>
                <div>
                  <strong>Celular / WhatsApp</strong>
                  <a href="https://wa.me/573136526230" target="_blank" rel="noreferrer">
                    313 652 6230
                  </a>
                </div>
              </div>
            </div>
            <div className="map-container">
              <iframe
                title="Autos y Latas en Google Maps"
                src="https://maps.google.com/maps?q=taller+autos+y+latas+Medellin&output=embed"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACTO ── */}
      <section id="contacto" className="section contacto-section">
        <div className="container">
          <div className="section-title">
            <span className="gold-line" />
            <h2>Contáctanos</h2>
            <span className="gold-line" />
          </div>
          <p className="section-subtitle">Estamos listos para ayudarte a encontrar lo que necesitas</p>
          <div className="contacto-buttons">
            <a
              href="https://wa.me/573136526230"
              target="_blank"
              rel="noreferrer"
              className="btn-whatsapp"
            >
              💬 WhatsApp · 313 652 6230
            </a>
            <a href="tel:6044236794" className="btn-phone">
              📞 Fijo · 604 423 6794
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <img src={logo} alt="Autos y Latas" className="footer-logo" />
        <p>© 2024 Autos &amp; Latas · La Candelaria, Medellín</p>
        <p className="footer-sub">Taxis nuevos · Repuestos de segunda</p>
      </footer>

    </div>
  )
}
