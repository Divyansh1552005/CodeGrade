import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

// Route-level code splitting: each page is its own lazily-loaded chunk.
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const SubmitCode = lazy(() => import('./pages/SubmitCode.jsx'));
const DoubtBoard = lazy(() => import('./pages/DoubtBoard.jsx'));
const AskDoubt = lazy(() => import('./pages/AskDoubt.jsx'));
const DoubtDetail = lazy(() => import('./pages/DoubtDetail.jsx'));
const TeacherReview = lazy(() => import('./pages/TeacherReview.jsx'));
const ProblemList = lazy(() => import('./pages/ProblemList.jsx'));
const CreateProblem = lazy(() => import('./pages/CreateProblem.jsx'));

function Fallback() {
  return <div className="p-10 text-center text-slate-400">Loading…</div>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <NavBar />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Suspense fallback={<Fallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Home />
                </ProtectedRoute>
              }
            />
            {/* Old generic submit path (problem picked from a dropdown) — retired
                in favor of the per-problem flow via /problems → /submit/:problemId.
            <Route
              path="/submit"
              element={
                <ProtectedRoute role="student">
                  <SubmitCode />
                </ProtectedRoute>
              }
            /> */}
            <Route
              path="/submit/:problemId"
              element={
                <ProtectedRoute role="student">
                  <SubmitCode />
                </ProtectedRoute>
              }
            />
            <Route
              path="/problems"
              element={
                <ProtectedRoute>
                  <ProblemList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/problems/new"
              element={
                <ProtectedRoute role="teacher">
                  <CreateProblem />
                </ProtectedRoute>
              }
            />
            <Route
              path="/problems/:id/edit"
              element={
                <ProtectedRoute role="teacher">
                  <CreateProblem />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doubts"
              element={
                <ProtectedRoute>
                  <DoubtBoard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doubts/new"
              element={
                <ProtectedRoute role="student">
                  <AskDoubt />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doubts/:id"
              element={
                <ProtectedRoute>
                  <DoubtDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/review"
              element={
                <ProtectedRoute role="teacher">
                  <TeacherReview />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
