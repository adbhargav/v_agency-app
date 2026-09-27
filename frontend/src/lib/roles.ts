import type { Role } from '../types';

export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : role === 'employee' ? '/app' : '/client');
