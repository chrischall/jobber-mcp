# Changelog

## [1.0.7](https://github.com/chrischall/jobber-mcp/compare/v1.0.6...v1.0.7) (2026-10-09)


### Bug Fixes

* annotate tools truthfully and sync manifests with the served tools ([#94](https://github.com/chrischall/jobber-mcp/issues/94)) ([d6f027f](https://github.com/chrischall/jobber-mcp/commit/d6f027f24ba3f5dce58de974ae63b49b2f161ccb))
* declare the plugin MCP config under the mcpServers key Claude Code reads ([#95](https://github.com/chrischall/jobber-mcp/issues/95)) ([4322987](https://github.com/chrischall/jobber-mcp/commit/43229870ab1e37e7a1264b85bd8f6c0f87d5261a))
* **deps:** update @chrischall/mcp-utils to 3.0.0 ([#93](https://github.com/chrischall/jobber-mcp/issues/93)) ([522b419](https://github.com/chrischall/jobber-mcp/commit/522b4198c88a6427b680b67a6bc00bc0f7010433))
* **mcpb:** configure several Client Hubs from the Claude Desktop bundle ([#92](https://github.com/chrischall/jobber-mcp/issues/92)) ([9a038b6](https://github.com/chrischall/jobber-mcp/commit/9a038b6deeb81a2a396db793357658c9f0f6f4d7))
* resolve low-severity audit findings ([#88](https://github.com/chrischall/jobber-mcp/issues/88)) ([8468a43](https://github.com/chrischall/jobber-mcp/commit/8468a431347775af78b29ce2bd4793c76de750f8))


### Documentation

* **skill:** fpx parser record urls are now hub-relative — prefix $JOBBER_HUB/ ([#91](https://github.com/chrischall/jobber-mcp/issues/91)) ([58ac0c2](https://github.com/chrischall/jobber-mcp/commit/58ac0c229dbd8dae2cc5e6fe60dbf6d8ef84df55))

## [1.0.6](https://github.com/chrischall/jobber-mcp/compare/v1.0.5...v1.0.6) (2026-10-07)


### Bug Fixes

* **deps:** bump source-map-js ([#87](https://github.com/chrischall/jobber-mcp/issues/87)) ([20f3a65](https://github.com/chrischall/jobber-mcp/commit/20f3a656729ef15e19b20007231e82d9a7a28980))
* **deps:** update mcp-utils to 2.15.0 and fetchproxy to 3.6.0 for elicitation opt-out and bridge fixes ([#85](https://github.com/chrischall/jobber-mcp/issues/85)) ([bdbfb02](https://github.com/chrischall/jobber-mcp/commit/bdbfb02ac432256d5f80cf6adf0313a1af77aeb8))

## [1.0.5](https://github.com/chrischall/jobber-mcp/compare/v1.0.4...v1.0.5) (2026-10-05)


### Bug Fixes

* **deps:** bump @fetchproxy/server ([#82](https://github.com/chrischall/jobber-mcp/issues/82)) ([5aefae2](https://github.com/chrischall/jobber-mcp/commit/5aefae2a63455f9fa88bd7186d8a79050b9d1147))
* **deps:** require @chrischall/mcp-utils 2.14.0 and MCP SDK 2.3.0 ([#84](https://github.com/chrischall/jobber-mcp/issues/84)) ([9aaddcc](https://github.com/chrischall/jobber-mcp/commit/9aaddcc369dec823bcbf7c1a4b9b6fbd6d144a2a))

## [1.0.4](https://github.com/chrischall/jobber-mcp/compare/v1.0.3...v1.0.4) (2026-10-03)


### Bug Fixes

* **deps:** bump @chrischall/mcp-utils to 2.12.0 ([#78](https://github.com/chrischall/jobber-mcp/issues/78)) ([4607627](https://github.com/chrischall/jobber-mcp/commit/4607627ae2d39199575657cbe84996facfa63f6a))
* **deps:** bump @chrischall/mcp-utils to 2.13.0 ([#79](https://github.com/chrischall/jobber-mcp/issues/79)) ([1dac148](https://github.com/chrischall/jobber-mcp/commit/1dac1485f61cf112125cdaa32b04ebe876df7d6d))
* keep credentials and report edge_blocked on CDN/WAF blocks (mcp-utils 2.10.0) ([#77](https://github.com/chrischall/jobber-mcp/issues/77)) ([3369b61](https://github.com/chrischall/jobber-mcp/commit/3369b61a85657f994f9972175d32a5090723c172))
* report CDN/WAF blocks as edge_blocked, not a rejected credential (mcp-utils 2.9.0) ([#75](https://github.com/chrischall/jobber-mcp/issues/75)) ([5afac84](https://github.com/chrischall/jobber-mcp/commit/5afac84974f1673e7c03880dd7859b3777c00e62))

## [1.0.3](https://github.com/chrischall/jobber-mcp/compare/v1.0.2...v1.0.3) (2026-09-27)


### Bug Fixes

* **deps:** bump the production-dependencies group with 2 updates ([#71](https://github.com/chrischall/jobber-mcp/issues/71)) ([1d0020c](https://github.com/chrischall/jobber-mcp/commit/1d0020c2f21896867de1d526581685efd85ac1a9))
* **deps:** move to [@fetchproxy](https://github.com/fetchproxy) 3.4 for ContextMint Bridge errors, capability subsets and managed pins ([#73](https://github.com/chrischall/jobber-mcp/issues/73)) ([db0b7b7](https://github.com/chrischall/jobber-mcp/commit/db0b7b723472586cec383c124cdccb695c9a780e))
* **deps:** move to @chrischall/mcp-utils 2.8 and [@fetchproxy](https://github.com/fetchproxy) 3.4.1 for clearer browser-bridge errors ([#74](https://github.com/chrischall/jobber-mcp/issues/74)) ([860b695](https://github.com/chrischall/jobber-mcp/commit/860b6957171e07a03a7cf62bc39cb4b36360e88f))

## [1.0.2](https://github.com/chrischall/jobber-mcp/compare/v1.0.1...v1.0.2) (2026-09-23)


### Bug Fixes

* **manifest:** describe jobber_read_page as limited to the four read page families ([#67](https://github.com/chrischall/jobber-mcp/issues/67)) ([6c2ad37](https://github.com/chrischall/jobber-mcp/commit/6c2ad37782b7c798d31cac2cfa752b27160a0b4d))
* **security:** keep the Client Hub id out of tool results and restrict jobber_read_page to read pages ([#64](https://github.com/chrischall/jobber-mcp/issues/64)) ([d98fada](https://github.com/chrischall/jobber-mcp/commit/d98fada08c67f6308a39a01b87a955db9faa102f))

## [1.0.1](https://github.com/chrischall/jobber-mcp/compare/v1.0.0...v1.0.1) (2026-09-23)


### Bug Fixes

* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#63](https://github.com/chrischall/jobber-mcp/issues/63)) ([47a609c](https://github.com/chrischall/jobber-mcp/commit/47a609c8da30a6e3c85112ee74ba0dc6ffed7356))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#61](https://github.com/chrischall/jobber-mcp/issues/61)) ([7029533](https://github.com/chrischall/jobber-mcp/commit/7029533173a8a4aea469edfe34053262eaa6d071))

## [1.0.0](https://github.com/chrischall/jobber-mcp/compare/v0.4.0...v1.0.0) (2026-09-20)


### Features

* **deps:** take mcp-utils 1.0.0, fixing server/discover ([#56](https://github.com/chrischall/jobber-mcp/issues/56)) ([81bbeab](https://github.com/chrischall/jobber-mcp/commit/81bbeab6fe08391df1e004434382b039a72923f0))


### Bug Fixes

* **release:** drop bump-minor-pre-major so a breaking change cuts a major ([#60](https://github.com/chrischall/jobber-mcp/issues/60)) ([123f3e0](https://github.com/chrischall/jobber-mcp/commit/123f3e0fde53f76591948f59db61978159ffa167))

## [0.4.0](https://github.com/chrischall/jobber-mcp/compare/v0.3.3...v0.4.0) (2026-09-17)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#52](https://github.com/chrischall/jobber-mcp/issues/52))

### Features

* **mcp:** migrate server to SDK v2 ([#52](https://github.com/chrischall/jobber-mcp/issues/52)) ([1408200](https://github.com/chrischall/jobber-mcp/commit/14082004b1f9c4aad14bc4ebd0fbdfc3488767d0))


### Bug Fixes

* **build:** resolve Zod bundle alias portably ([#55](https://github.com/chrischall/jobber-mcp/issues/55)) ([48f00dd](https://github.com/chrischall/jobber-mcp/commit/48f00ddcdcbabc4e5a2ce1e0134601df212fb169))

## [0.3.3](https://github.com/chrischall/jobber-mcp/compare/v0.3.2...v0.3.3) (2026-09-15)


### Bug Fixes

* **deps:** @fetchproxy/server 3.0.1 — capped peer frames, logged load drops, atomic identity writes ([#49](https://github.com/chrischall/jobber-mcp/issues/49)) ([ef6156a](https://github.com/chrischall/jobber-mcp/commit/ef6156a315a02b7110d8d3f38722388635473221))

## [0.3.2](https://github.com/chrischall/jobber-mcp/compare/v0.3.1...v0.3.2) (2026-09-14)


### Bug Fixes

* **deps:** @fetchproxy/server 2.11.3, so the hosted extension pin persists ([#44](https://github.com/chrischall/jobber-mcp/issues/44)) ([110b120](https://github.com/chrischall/jobber-mcp/commit/110b120035cdb3fe779dc1a310e1beede52950c5))
* **deps:** @fetchproxy/server 3.0.0 — protocol v4 (forward secrecy, AAD over the frame) ([#48](https://github.com/chrischall/jobber-mcp/issues/48)) ([5632074](https://github.com/chrischall/jobber-mcp/commit/5632074c63b5517aee8a2d31872e45ac90621507))
* **deps:** bump zod in the production-dependencies group ([#47](https://github.com/chrischall/jobber-mcp/issues/47)) ([05da44c](https://github.com/chrischall/jobber-mcp/commit/05da44c43ee9c7fec88aced89d7f9a032896dd34))

## [0.3.1](https://github.com/chrischall/jobber-mcp/compare/v0.3.0...v0.3.1) (2026-09-10)


### Bug Fixes

* **deps:** @fetchproxy/server 2.10.0 and @chrischall/mcp-utils 0.26.1 ([#42](https://github.com/chrischall/jobber-mcp/issues/42)) ([44fd742](https://github.com/chrischall/jobber-mcp/commit/44fd7428df83d13e52430faf18a125f913074e7b))
* **deps:** bump hono from 4.13.1 to 4.13.7 ([#40](https://github.com/chrischall/jobber-mcp/issues/40)) ([1113dc6](https://github.com/chrischall/jobber-mcp/commit/1113dc611d2cd2e7c0f974fdff19952d881a991c))

## [0.3.0](https://github.com/chrischall/jobber-mcp/compare/v0.2.0...v0.3.0) (2026-09-04)


### Features

* **tools:** compact by default — strip media URLs, and minify every response ([#31](https://github.com/chrischall/jobber-mcp/issues/31)) ([43252c9](https://github.com/chrischall/jobber-mcp/commit/43252c9c9e390ca2deceedae25cdfa7901359e9e))

## [0.2.0](https://github.com/chrischall/jobber-mcp/compare/v0.1.1...v0.2.0) (2026-08-29)


### Features

* **deps:** take @fetchproxy/server 2.2.0 so the concentrator can bind its sandbox address ([#17](https://github.com/chrischall/jobber-mcp/issues/17)) ([9ac5963](https://github.com/chrischall/jobber-mcp/commit/9ac596388388283505ffd4fc7081c6e2e427e6c6))

## [0.1.1](https://github.com/chrischall/jobber-mcp/compare/v0.1.0...v0.1.1) (2026-08-28)


### Bug Fixes

* **egress:** declare only the hosts the server process dials in mint.yaml ([#15](https://github.com/chrischall/jobber-mcp/issues/15)) ([7eb706a](https://github.com/chrischall/jobber-mcp/commit/7eb706ad41b4f5cff76295e5f7f123ed548ec4a1))

## 0.1.0 (2026-08-11)


### Features

* Jobber Client Hub MCP server and fpx access skill ([f8f3591](https://github.com/chrischall/jobber-mcp/commit/f8f3591c172ef56412f20ca4a495c716cb2b85a9))
