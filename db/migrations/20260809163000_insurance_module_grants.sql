-- Grant execute on the helper used by the insurance module insert policies.

REVOKE ALL ON FUNCTION app_private.can_access_client_module_record(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can_access_client_module_record(uuid, uuid, uuid, text) TO authenticated, service_role;
