import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import RootLayout from './layouts/RootLayout.jsx';
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
const Profile = lazy(() => import('./pages/Profile.jsx'));

// Route table lives here, separate from the shell (RootLayout) and the
// per-route auth gate (ProtectedRoute), so adding a page is a one-line diff.
const routes = [
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    ),
  },
  {
    path: '/submit/:problemId',
    element: (
      <ProtectedRoute role="student">
        <SubmitCode />
      </ProtectedRoute>
    ),
  },
  {
    path: '/problems',
    element: (
      <ProtectedRoute>
        <ProblemList />
      </ProtectedRoute>
    ),
  },
  {
    path: '/problems/new',
    element: (
      <ProtectedRoute role="teacher">
        <CreateProblem />
      </ProtectedRoute>
    ),
  },
  {
    path: '/problems/:id/edit',
    element: (
      <ProtectedRoute role="teacher">
        <CreateProblem />
      </ProtectedRoute>
    ),
  },
  {
    path: '/doubts',
    element: (
      <ProtectedRoute>
        <DoubtBoard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/doubts/new',
    element: (
      <ProtectedRoute role="student">
        <AskDoubt />
      </ProtectedRoute>
    ),
  },
  {
    path: '/doubts/:id',
    element: (
      <ProtectedRoute>
        <DoubtDetail />
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute>
        <Profile />
      </ProtectedRoute>
    ),
  },
  {
    path: '/review',
    element: (
      <ProtectedRoute role="teacher">
        <TeacherReview />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

// Data router (createBrowserRouter/RouterProvider) — the router.dev
// recommendation over the legacy <BrowserRouter>/<Routes> element tree.
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: routes,
  },
]);
