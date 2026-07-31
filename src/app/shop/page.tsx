import { notFound } from "next/navigation";
import ShopOrderPage from "@/app/shop/ShopOrderPage";

/** Boutique client en local : http://localhost:3000/shop (dev uniquement). */
export default async function ShopLocalPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }
  return <ShopOrderPage />;
}
