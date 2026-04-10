'use client';

import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { DesignLogProvider } from '@/lib/hooks/use-design-log';

export default function OnboardingPage() {
  return (
    <DesignLogProvider>
      <OnboardingWizard />
    </DesignLogProvider>
  );
}
