import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { WatchlistPage } from './features/watchlist/WatchlistPage'
import { DividendsPage } from './features/dividends/DividendsPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WatchlistPage />} />
        <Route path="/dividends/:code" element={<DividendsPage />} />
        <Route
          path="*"
          element={
            <main className="history-page">
              <h1>页面不存在</h1>
              <Link to="/">返回关注列表</Link>
            </main>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
export default App
