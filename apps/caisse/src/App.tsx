import CustomerScreen from "./screens/CustomerScreen";
import CashierScreen from "./screens/CashierScreen";

export default function App() {
  const isCustomer = window.location.hash === "#customer" || window.location.hash === "#/customer";
  if (isCustomer) {
    return <CustomerScreen />;
  }
  return <CashierScreen />;
}
