# @skillctl/testing

Experimental behavioral-testing internals for skillctl 0.9. The API, YAML schema details, and runner contracts may change before 1.0. Plugins and consumers must not treat this package as stable.

The package executes agent runners and trusted test commands as user code. Isolation limits configuration leakage but is not an absolute security sandbox.
