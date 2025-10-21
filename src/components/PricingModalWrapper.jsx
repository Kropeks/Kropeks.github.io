'use client';

import { PricingModalProvider, usePricingModal } from '@/context/PricingModalContext';
import PricingFormModal from '@/components/subscription/PricingFormModal';

function PricingModalPortal() {
  const { isOpen, closeModal, plan } = usePricingModal();

  return (
    <PricingFormModal
      isOpen={isOpen}
      onClose={closeModal}
      planType={plan}
    />
  );
}

export default function PricingModalWrapper({ children }) {
  return (
    <PricingModalProvider>
      {children}
      <PricingModalPortal />
    </PricingModalProvider>
  );
}
