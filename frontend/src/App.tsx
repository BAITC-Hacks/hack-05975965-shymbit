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
import { TeamsPage } from './pages/TeamsPage'
import { TeamPage } from './pages/TeamPage'
import { TeamEditorPage } from './pages/TeamEditorPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="tasks" element={<CatalogPage />} />
        <Route path="tasks/new" element={<CreateTaskPage key="new" />} />
        <Route path="tasks/:id/edit" element={<CreateTaskPage key="edit" />} />
        <Route path="tasks/:id/clarify" element={<ClarifyPage />} />
        <Route path="tasks/:id/applications" element={<ApplicationsPage />} />
        <Route path="tasks/:id" element={<TaskPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/new" element={<TeamEditorPage key="new" />} />
        <Route path="teams/:id/edit" element={<TeamEditorPage key="edit" />} />
        <Route path="teams/:id" element={<TeamPage />} />
        <Route path="catalog" element={<Navigate to="/tasks" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
