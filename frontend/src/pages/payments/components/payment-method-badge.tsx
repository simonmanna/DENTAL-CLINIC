import { PaymentMethod } from '@/types/payment';
import { Badge } from '@/components/ui/badge';
import { 
  Banknote, CreditCard, Smartphone, Landmark, FileText, HelpCircle 
} from 'lucide-react';

const methodConfig: Record<PaymentMethod, { label: string; icon: React.ReactNode }> = {
  CASH: { label: 'Cash', icon: <Banknote className="h-3 w-3" /> },
  VISA_CARD: { label: 'Visa', icon: <CreditCard className="h-3 w-3" /> },
  MASTERCARD: { label: 'Mastercard', icon: <CreditCard className="h-3 w-3" /> },
  MTN_MOBILE_MONEY: { label: 'MTN MoMo', icon: <Smartphone className="h-3 w-3" /> },
  AIRTEL_MONEY: { label: 'Airtel Money', icon: <Smartphone className="h-3 w-3" /> },
  INSURANCE: { label: 'Insurance', icon: <FileText className="h-3 w-3" /> },
  BANK_TRANSFER: { label: 'Bank Transfer', icon: <Landmark className="h-3 w-3" /> },
  CHEQUE: { label: 'Cheque', icon: <FileText className="h-3 w-3" /> },
  CREDIT_NOTE: { label: 'Credit Note', icon: <FileText className="h-3 w-3" /> },
};

export function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const config = methodConfig[method] || { label: method, icon: <HelpCircle className="h-3 w-3" /> };
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      {config.icon}
      {config.label}
    </Badge>
  );
}