import { mockProvider } from './mock';
import { supabaseProvider } from './supabase';
import type { DataProvider } from './provider';

export const DATA_MODE = process.env.NEXT_PUBLIC_DATA_MODE === 'supabase' ? 'supabase' : 'mock';
export const data: DataProvider = DATA_MODE === 'supabase' ? supabaseProvider : mockProvider;
export type { DataProvider };
