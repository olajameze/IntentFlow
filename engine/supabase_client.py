"""Supabase client factory (service role)."""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from config import supabase_service_role_key, supabase_url


@lru_cache
def get_supabase() -> Client:
    return create_client(supabase_url(), supabase_service_role_key())
