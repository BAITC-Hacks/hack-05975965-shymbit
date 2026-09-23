import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ApplicationsPage } from './pages/ApplicationsPage'
import { CatalogPage } from './pages/CatalogPage'
import { ClarifyPage } from './pages/ClarifyPage'
import { CreateTaskPage } from './pages/CreateTaskPage'
import { HomePage } from './pages/HomePage'
import { MyTasksPage } from './pages/MyTasksPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TaskPage } from './pages/TaskPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="tasks" element={<CatalogPage />} />
        <Route path="tasks/new" element={<CreateTaskPage />} />
        <Route path="tasks/:id/edit" element={<CreateTaskPage />} />
        <Route path="tasks/:id/clarify" element={<ClarifyPage />} />
        <Route path="tasks/:id/applications" element={<ApplicationsPage />} />
        <Route path="tasks/:id" element={<TaskPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="catalog" element={<Navigate to="/tasks" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
