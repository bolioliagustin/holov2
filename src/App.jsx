import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard  from './pages/Dashboard';
import Events     from './pages/Events';
import Invitados  from './pages/Invitados';
import AssignNFC  from './pages/AssignNFC';
import VideoIA    from './pages/VideoIA';
import Config     from './pages/Config';
import Logs       from './pages/Logs';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<Dashboard />} />
        <Route path="/events"    element={<Events />} />
        <Route path="/invitados" element={<Invitados />} />
        <Route path="/nfc"       element={<AssignNFC />} />
        <Route path="/video"     element={<VideoIA />} />
        <Route path="/config"    element={<Config />} />
        <Route path="/logs"      element={<Logs />} />
      </Routes>
    </Layout>
  );
}
