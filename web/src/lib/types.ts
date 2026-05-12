export type BusinessType =
  | "local_service"
  | "b2b_saas"
  | "agency"
  | "ecommerce"
  | "generic";

export type BusinessRow = {
  id: string;
  name: string;
  type: BusinessType;
  target_audience: string | null;
  industry: string | null;
  social_accounts: Record<string, string>;
  website_url: string | null;
  goals: string | null;
  stripe_secret_ciphertext: string | null;
  stripe_secret_iv: string | null;
  stripe_secret_tag: string | null;
  umami_website_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};
