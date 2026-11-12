export interface EndpointParam {
  name: string;
  type: string;
  default?: string;
  required: boolean;
}

export interface Endpoint {
  id: number;
  name: string;
  category: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  min_plan: 'free' | 'basic' | 'vip' | 'enterprise';
  status: 'active' | 'maintenance' | 'deprecated';
  params: EndpointParam[];
  created_at?: string;
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  plan: 'free' | 'basic' | 'vip' | 'enterprise';
  limit_daily: number;
  limit_remaining: number;
  banned: boolean;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key: string;
  is_active: boolean;
  created_at: string;
}

export interface SystemSettings {
  id: number;
  maintenance_mode: boolean;
  maintenance_message: string;
  updated_at: string;
}

export interface TelemetryData {
  node: string;
  platform: string;
  node_version: string;
  cpu: {
    model: string;
    cores: number;
    usage_percent: number;
  };
  memory: {
    used_gb: string;
    total_gb: string;
    usage_percent: number;
  };
  uptime: {
    raw_seconds: number;
    formatted: string;
  };
  timestamp: string;
}

export interface ApiLog {
  id: number;
  created_at: string;
  ip_address: string;
  method: string;
  endpoint_path: string;
  status_code: number;
  latency_ms: number;
}
