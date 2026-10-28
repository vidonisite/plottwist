import './Home.css'

export default function Home({ onOpenCamera, onOpenChat }) {
  return (
    <section className="page home-page">
      <div className="eyebrow"><span className="status-dot" /> DIN LILLA HEMLIGHETSVÄRLD</div>
      <h1>Lite hemligt.<br /><span>Mycket plot twist.</span></h1>
      <p className="page-intro">Skicka något oväntat till någon som betyder något.</p>

      <button className="secret-card" onClick={onOpenCamera}>
        <span className="card-sparkle sparkle-one">✳</span>
        <span className="envelope">✉</span>
        <span className="secret-card-title">Dags för en Secret Drop?</span>
        <span className="secret-card-copy">En hemlig text, en selfie och en liten överraskning.</span>
        <span className="pill-button">Skapa en drop <span>↗</span></span>
        <span className="card-sparkle sparkle-two">✦</span>
      </button>

      <div className="section-heading">
        <div>
          <p className="eyebrow">HÄR HÄNDER DET</p>
          <h2>Dina spaces</h2>
        </div>
        <span className="tiny-label">SNART MER ✨</span>
      </div>

      <button className="space-card" onClick={onOpenChat}>
        <span className="space-avatar">♡</span>
        <span className="space-text">
          <strong>Din privata chatt</strong>
          <small>En plats bara för dig och dina vänner.</small>
        </span>
        <span className="space-arrow">↗</span>
      </button>

      <p className="prototype-note">Förhandsversion · Inga meddelanden skickas ännu</p>
    </section>
  )
}
