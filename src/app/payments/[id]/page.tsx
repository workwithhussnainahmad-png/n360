import { PaymentDetails } from "./PaymentDetails";
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  return <PaymentDetails id={(await params).id} />;
}
