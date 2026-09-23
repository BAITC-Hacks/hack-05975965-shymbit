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

import { Access } from './components/Access'
import { AuthPage } from './pages/AuthPage'
import { StudentDashboard } from './pages/StudentDashboard'
import { useSession } from './lib/session'

export default function App() {
  const session = useSession()
  return (
    <Routes key={session?.user.id || "guest"}>
      <Route element={<Layout />}>
        <Route path="account" element={<AuthPage />} />
        <Route path="login" element={<AuthPage />} />
        <Route path="my-teams" element={<Access role="student"><StudentDashboard /></Access>} />
        <Route index element={<HomePage />} />
        <Route path="tasks" element={<CatalogPage />} />
        <Route path="tasks/new" element={<Access role="business"><CreateTaskPage key="new" /></Access>} />
        <Route path="tasks/:id/edit" element={<Access role="business"><CreateTaskPage key="edit" /></Access>} />
        <Route path="tasks/:id/clarify" element={<Access role="business"><ClarifyPage /></Access>} />
        <Route path="tasks/:id/applications" element={<Access role="business"><ApplicationsPage /></Access>} />
        <Route path="tasks/:id" element={<TaskPage />} />
        <Route path="my-tasks" element={<Access role="business"><MyTasksPage /></Access>} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/new" element={<Access role="student"><TeamEditorPage key="new" /></Access>} />
        <Route path="teams/:id/edit" element={<Access role="student"><TeamEditorPage key="edit" /></Access>} />
        <Route path="teams/:id" element={<TeamPage />} />
        <Route path="catalog" element={<Navigate to="/tasks" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
