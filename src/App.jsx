import { BrowserRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/layout/Layout";

import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Users from "./pages/Users";
import Dashboard from "./pages/Dashboard";
import Workers from "./pages/Workers";
import WorkerDetails from "./pages/WorkerDetails";
import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import Vendors from "./pages/Vendors";
import VendorDetails from "./pages/VendorDetails";
import PurchasePlan from "./pages/PurchasePlan";
import Income from "./pages/Income";
import Expense from "./pages/Expense";
import Pending from "./pages/Pending";
import Settings from "./pages/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Everything inside here requires login and shares the app shell */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/workers"
            element={
              <ProtectedRoute requireAdmin>
                <Workers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workers/:id"
            element={
              <ProtectedRoute requireAdmin>
                <WorkerDetails />
              </ProtectedRoute>
            }
          />
          <Route path="/products" element={<Products />} />
          <Route path="/products/:id" element={<ProductDetails />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:id" element={<VendorDetails />} />
          <Route
            path="/purchase-plan"
            element={
              <ProtectedRoute requireAdmin>
                <PurchasePlan />
              </ProtectedRoute>
            }
          />
          <Route path="/income" element={<Income />} />
          <Route path="/expense" element={<Expense />} />
          <Route path="/pending" element={<Pending />} />
          <Route
            path="/users"
            element={
              <ProtectedRoute requireAdmin>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
