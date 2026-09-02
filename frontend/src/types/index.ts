// Shared application types.
import type { Dayjs } from 'dayjs';
import type { components } from './api';
export type Role =
  | 'admin'
  | 'lab_manager'
  | 'coordinator'
  | 'faculty'
  | 'stockroom'
  | 'lab_assistant';

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  lipscomb_id: string | null;
  role: Role;
  // Human-readable label for `role` (e.g. "Lab Manager") — from the
  // backend's Role.choices via get_role_display(), not duplicated here.
  role_display: string;
}

export interface UserRegistration extends Omit<
  User,
  'id' | 'role' | 'role_display' | 'lipscomb_id'
> {
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
// Matches DRF's partial=True PATCH semantics — same fields as ContainerWrite, all optional.
export type ContainerPatch = components['schemas']['PatchedContainerWrite'];

// Detects which keys of a generated schema type are `readonly` (i.e. DRF
// read_only=True fields). `readonly` only exists at compile time, so this
// can't drive runtime behavior — it's a guardrail that makes it a type
// error to mark a read-only field as an editable table column.
type IfEquals<X, Y, A = X, B = never> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

export type ReadonlyKeys<T> = {
  // Pick<T, P> is homomorphic (preserves T's actual readonly modifier for
  // P); the second arg force-strips it. Only genuinely readonly keys differ.
  [P in keyof T]-?: IfEquals<Pick<T, P>, { -readonly [Q in P]: T[P] }, never, P>;
}[keyof T];

export type EditableKeys<T> = Exclude<keyof T, ReadonlyKeys<T>>;
export type Chemical = components['schemas']['Chemical'];
export type StorageCategory = components['schemas']['ChemicalStorageCategories'];
export type UnitEnums = components['schemas']['QuantityUnitEnum'];
export type CheckoutEvent = components['schemas']['CheckoutEvent'];
export type WeightReading = components['schemas']['WeightReading'];
export type LocationType = components['schemas']['LocationType'];
export type Dashboard = {
  recently_added: Container[];
  restock_soon: Container[];
  checked_out: Container[];
};
export interface Container extends Omit<ApiContainer, 'latest_reading' | 'checkout_status'> {
  readonly latest_reading: WeightReading;
  readonly checkout_status: CheckoutEvent;
}

export interface Location extends Omit<ApiLocation, 'children'> {
  children: Location[];
  containers: Container[];
}

export type WeighInDefaults = {
  checkin: {
    slug: string;
    weight: string;
    // Backfill for containers that don't have a real tare weight yet —
    // only sent when the row's container actually needs one (see
    // WeighIn.tsx); omitted/blank rows leave the container as-is.
    tare_weight?: string;
  }[];
};

export interface CasCheck {
  mixtures: Chemical[];
  chemicals: Chemical[];
}

export interface ContainerFormDefaults {
  print: boolean;
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
  date_received: Dayjs | null | string;
  density: string | number;
  expiration_date: string | Dayjs | null;
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
  location: string | number;
  manufacturer: string;
  product_num: string;
  initial_quantity: string | number;
  quantity_unit: string;
};

export type BalanceReading = {
  weight: number;
  unit: string;
};

export type PrinterStatus = {
  battery_level: number;
  media_width_mm: number;
  media_length: number;
  media_type: string;
  errors: string[];
};

export type PrintParams = {
  template: number;
  fields: Record<string, string>;
  copies: 1;
};

export type PrintConfirmation = {
  printed: true;
};
