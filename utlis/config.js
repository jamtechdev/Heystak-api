import dotenv from 'dotenv';

dotenv.config();

export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_KEY = process.env.SUPABASE_KEY;
export const FACEBOOK_ADS_URL = process.env.FACEBOOK_ADS_URL;
export const BASE_PORT = process.env.BASE_PORT || 8090;
