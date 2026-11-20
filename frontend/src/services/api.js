import axios from 'axios';
import { supabase } from './supabase';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  getMe: () => api.get('/api/auth/me').then((r) => r.data),
  registerProfile: (payload) => api.post('/api/auth/register-profile', payload).then((r) => r.data),
  listSuppliers: () => api.get('/api/auth/suppliers').then((r) => r.data),
};

export const rfqApi = {
  list: () => api.get('/api/rfqs/').then((r) => r.data),
  create: (payload) => api.post('/api/rfqs/', payload).then((r) => r.data),
  getDetail: (rfqId) => api.get(`/api/rfqs/${rfqId}`).then((r) => r.data),
  inviteSuppliers: (rfqId, supplierIds) =>
    api.post(`/api/rfqs/${rfqId}/suppliers`, { supplier_ids: supplierIds }).then((r) => r.data),
  getAuctionState: (rfqId) => api.get(`/api/rfqs/${rfqId}/auction`).then((r) => r.data),
  getRanking: (rfqId) => api.get(`/api/rfqs/${rfqId}/ranking`).then((r) => r.data),
  getActivity: (rfqId) => api.get(`/api/rfqs/${rfqId}/activity`).then((r) => r.data),
  listBids: (rfqId) => api.get(`/api/rfqs/${rfqId}/bids`).then((r) => r.data),
  submitBid: (rfqId, payload) => api.post(`/api/rfqs/${rfqId}/bids`, payload).then((r) => r.data),
};

export default api;
