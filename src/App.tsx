import { Routes, Route, Link } from "react-router-dom";
import ImageAnalyzerPage from "./pages/ImageAnalyzerPage";
import ImgToHmPage from "./pages/ImgToHmPage";
import "./App.css";

function App() {
  return (
    <div className="container">
      <header className="app-header">
        <h1>HMUtil</h1>
        <nav className="nav-links">
          <Link to="/">Анализатор изображений</Link>
          <Link to="/img-to-hm">Конвертер IMG в PNG</Link>
        </nav>
      </header>
      
      <main className="main-content">
        <Routes>
          <Route path="/" element={<ImageAnalyzerPage />} />
          <Route path="/img-to-hm" element={<ImgToHmPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;