// Shared application types.
import type { components } from './api';
export type Role = 'lab_manager' | 'stockroom' | 'viewer';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
}

export interface UserRegistration extends Omit<User, 'id' | 'role'> {
  password: string;
  lipscomb_id: string;
}

export interface PreValidation {
  errors: {
    username?: string;
    email?: string;
  };
}

type ApiContainer = components['schemas']['Container'];
type ApiLocation = components['schemas']['Location'];

export type ContainerWrite = components['schemas']['ContainerWrite'];
export type Chemical = components['schemas']['Chemical'];
export type StorageCategory = components['schemas']['ChemicalStorageCategories'];
export type UnitEnums = components['schemas']['QuantityUnitEnum'];
export type CheckoutEvent = components['schemas']['CheckoutEvent'];
export type WeightReading = components['schemas']['WeightReading'];
export type LocationType = components['schemas']['LocationType'];

export interface Container extends Omit<ApiContainer, 'latest_reading' | 'checkout_status'> {
  readonly latest_reading: WeightReading;
  readonly checkout_status: CheckoutEvent;
}

export interface Location extends Omit<ApiLocation, 'children'> {
  children: Location[];
}

export type WeighInDefaults = {
  slug: string;
  weight: string;
};

export interface CasCheck {
  mixtures: Chemical[];
  chemicals: Chemical[];
}

export interface ContainerFormDefaults {
  name: string;
  multiple_cas: boolean;
  mixture_name: string;
  mixture_storage_category: string | number;
  mixture_molecular_weight: string;
  chemicals: {
    cas: string;
    name: string;
    molecular_weight: string;
    storage_category: string | number;
  }[];
  location: string | number;
  manufacturer: string;
  initial_quantity: string | number;
  quantity_unit: string;
  product_num: string;
  date_received: string | null;
  density: string | number;
  expiration_date: string | null;
  initial_weight: string | number;
  tare_weight: string | number;
  mixture_id: string | number;
}

export interface ContainerOptions {
  name: string;
  description: string;
  renders: string[];
  parses: string[];
  actions: {
    POST: {
      quantity_unit: {
        choices: { value: string; display_name: string }[];
      };
    };
  };
}

export type ContainerDetailDefaults = {
  name: string;
  location: string;
  manufacturer: string;
  product_num: string;
  initial_quantity: string | number;
  quantity_unit: string;
};
