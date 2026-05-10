// ============================================================
// Round 1B — Self-serve signup + onboarding wizard shared types.
// ============================================================

export type OnboardingScenario =
    | 'small'           // Малый ИП — minimal integrations
    | 'medium_kontur'   // Средний бизнес с Контур.Диадок
    | 'medium_sbis'     // Средний бизнес с СБИС
    | 'enterprise';     // Крупный — full stack

export const ONBOARDING_SCENARIOS: ReadonlyArray<OnboardingScenario> = [
    'small', 'medium_kontur', 'medium_sbis', 'enterprise',
];

/** Provider domain — same shape as `apps/api/src/providers/base.ts` ProviderType. */
export type ProviderType =
    | 'signature'
    | 'edi'
    | 'telematics'
    | 'fuel_card'
    | 'fines'
    | 'marking'
    | 'payment'
    | 'email';

/** Concrete adapter names the onboarding wizard knows about. */
export type ProviderName =
    | 'gosklyuch'
    | 'kontur_sign'
    | 'sbis_sign'
    | 'cadesplugin'
    | 'diadoc'
    | 'sbis'
    | 'kontur'
    | 'taxcom'
    | 'kaluga_astral'
    | 'wialon'
    | 'omnicomm'
    | 'glonasssoft'
    | 'lukoil'
    | 'rosneft'
    | 'gazpromneft'
    | 'autocode'
    | 'fssp'
    | 'gibdd'
    | 'crpt'
    | 'yookassa'
    | 'tinkoff'
    | 'cloudpayments'
    | 'mailru_smtp'
    | 'unisender'
    | 'console'
    | 'mock';

export interface SignupRequest {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    companyName?: string;
}

export interface SignupResponse {
    signupId: string;
    /** 'pending' until /verify-email succeeds. */
    status: 'pending';
}

export interface VerifyEmailRequest {
    email: string;
    code: string;
}

export interface ResendCodeRequest {
    email: string;
}

export interface OnboardingIntegrationChoice {
    providerType: ProviderType;
    providerName: ProviderName;
    /** True when the user clicked "Подключу позже". */
    deferred: boolean;
    /** Set if credentials were entered during the wizard. */
    hasCredentials: boolean;
}

export interface OnboardingStatus {
    organizationId: string;
    step: number;
    scenario: OnboardingScenario | null;
    completed: boolean;
    completedAt: string | null;
    profile: {
        inn: string | null;
        name: string | null;
        kpp: string | null;
        ogrn: string | null;
        legalAddress: string | null;
        bankBik: string | null;
        bankAccount: string | null;
    };
    integrations: OnboardingIntegrationChoice[];
}

export interface OnboardingProfileRequest {
    inn: string;
    name: string;
    kpp?: string | null;
    ogrn?: string | null;
    legalAddress?: string | null;
    bankBik?: string | null;
    bankAccount?: string | null;
}

export interface OnboardingScenarioRequest {
    scenario: OnboardingScenario;
}

export interface OnboardingIntegrationChoiceRequest {
    providerType: ProviderType;
    providerName: ProviderName;
    defer: boolean;
    credentials?: Record<string, unknown>;
}

export interface OnboardingInviteRequest {
    invites: Array<{
        email: string;
        fullName: string;
        roles: string[];
    }>;
}

export interface InnLookupRequest {
    inn: string;
}

export interface InnLookupResponse {
    inn: string;
    name: string;
    fullName: string;
    kpp: string;
    ogrn: string;
    legalAddress: string;
    actualAddress: string;
    managementName: string;
    managementPost: string;
    status: string;
}

export const ONBOARDING_STEP_COUNT = 6;
