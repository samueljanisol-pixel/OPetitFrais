import CustomerScreen from "./screens/CustomerScreen";
import CashierGate from "./screens/CashierGate";

export default function App() {
  const isCustomer = window.location.hash === "#customer" || window.location.hash === "#/customer";
  if (isCustomer) {
    return <CustomerScreen />;
  }
  return <CashierGate />;
}
