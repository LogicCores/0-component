
exports.forLib = function (LIB) {

    const COMPONENT = require("../../../../lib/firewidgets-for-zerosystem/window.component");
    const DATA_MAPPER  = require("../../../data/for/ccjson.record.mapper/0-window.api").forLib(LIB);

    const ADAPTER_CHSCRIPT = require("./adapter.chscript").forLib(LIB);
    const ADAPTER_JQUERY = require("./adapter.jquery").forLib(LIB);

    const h = LIB.vdom.h;
    const ch = require("../../../../lib/cvdom/ch");
    const createElement = LIB.vdom.createElement;

    var exports = {};

    exports.spin = function (context) {

        // HACK: Remove conce components subscribe properly
        var dataInitialized = new LIB.Promise(function (resolve, reject) {
           context.contexts.data.once("initialized", resolve);
           // TODO: Set timeout and trigger reject after 10 sec.
        }).then(function () {
            console.log("data initialized!");
        });

        var FireWidgetsComponent = function () {
            var self = this;
        }

        FireWidgetsComponent.prototype.liftComponentsForPageFragment = function (page, html) {
            return new LIB.Promise(function (resolve, reject) {
                try {
                    // TODO: Proactively start initializing component implementations
                    //       so they are ready to go when HTML gets rendered in container.
                    //       This is irrelevant right now as component implementations
                    //       are loaded in batch along with app.
        
                    // TODO: Use proper HTML parser.
                    var lines = html.split("\n");
                    var linesOut = [];
                    var m = null;
                    var scriptInfo = null;
                    var scriptBuffer = null;
                    for (var i=0 ; i<lines.length ; i++) {
                        if (scriptBuffer) {
                            if (/<\/script>/.test(lines[i])) {
                                if (scriptInfo.location === "window") {
                                    if (scriptInfo.context === "FireWidget/Bundle") {
        
                                        // TODO: Only eval if bundle has correct signature.
                                        var container = new Function("FireWidget", scriptBuffer.join("\n"));
                                        container({
                                            registerTemplate: function (impl) {
                                                if (typeof impl.getScripts === "function") {
                                                    
                                                    var scripts = impl.getScripts();
                                                    Object.keys(scripts).forEach(function (componentId) {
                                                        if (!scripts[componentId].window) return;

                                    			        context.firewidgets.registerImplementationForPage(
                                    			            context.contexts.page.getPath(),
                                    			            componentId,
                                    			            scripts[componentId].window
                                    			        );
                                                    });
/*
                                                    scripts.forEach(function (scriptInfo) {
                                                        context.registerComponentScript(scriptInfo.id, new Function(
                                                            "context",
                                                            scriptInfo.code
                                                        ));
                                                    });
*/
                                                }
                                                if (typeof impl.getComponents === "function") {
                                                    var components = impl.getComponents();
                                                    Object.keys(components).forEach(function (id) {
                                                        context.registerComponentOverrideTemplateForActivePage(
                                                            id,
                                                            components[id]
                                                        );
                                                    });
                                                }

                                                // Render page template
                                                var layoutInfo = impl.getLayout();
                                                var chi = ch({
                                                    "$anchors": function (name) {
                                                        return null;                                                            
                                                    }
                                                });
                                                var vtree = layoutInfo.buildVTree(h, chi);
                                                return resolve(function render () {
                                                    return createElement(vtree);
                                                });
                                            }
                                        });
                                    } else
                                    if (scriptInfo.id) {
                                        context.registerComponentScript(scriptInfo.id, new Function(
                                            "context",
                                            scriptBuffer.join("\n")
                                        ));
                                    }
                                }
                                scriptInfo = null;
                                scriptBuffer = null;
                                continue;
                            }
                            scriptBuffer.push(lines[i]);
                            continue;
                        }
                        // TODO: Be much more forgiving.
                        m = lines[i].match(/<script data-component-id="([^"]+)" data-component-location="([^"]+)">/);
                        if (m) {
                            scriptInfo = {
                                id: m[1],
                                location: m[2]
                            };
                            scriptBuffer = [];
                            continue;
                        }
                        m = lines[i].match(/<script data-component-context="([^"]+)" data-component-location="([^"]+)">/);
                        if (m) {
                            scriptInfo = {
                                context: m[1],
                                location: m[2]
                            };
                            scriptBuffer = [];
                            continue;
                        }
                        m = lines[i].match(/<(.+)data-component-impl="([^"]+)"(.*)\/>/);
                        if (m) {
                            var impl = m[2];
                            m = (m[1] + m[3]).match(/data-component-id="([^"]+)"/);
                            if (m) {
                                var componentImplementation = context.getComponentInstanceFactory(impl);
                                if (!componentImplementation) {
                                    throw new Error("No component implementation found for '" + impl + "'!");
                                }
                                var comp = new componentImplementation();
                                var htm = comp.templateHtml;
                                htm = htm.replace(/<(\S+) /, '<$1 data-component-id="' + m[1] + '" data-component-impl="' + impl + '" ');

                                // TODO: Use common helper for this.
                                var re = /(<|\s)component\s*:\s*([^=]+)(\s*=\s*"[^"]*"(?:\/?>|\s))/g;
            					var m;
            					while ( (m = re.exec(htm)) ) {
            						htm = htm.replace(
            						    new RegExp(LIB.RegExp_Escape(m[0]), "g"),
            						    m[1] + "data-component-" + m[2].replace(/:/g, "-") + m[3]
            						);
            					}

                                linesOut = linesOut.concat(htm.split("\n"));
                                continue;
                            }
                        }
                        linesOut.push(lines[i]);
                    }
                    return resolve(linesOut.join("\n"));
                } catch (err) {
                    return reject(err);
                }
            });
        }

        FireWidgetsComponent.prototype.instanciateComponents = function (components, parentDataObject) {
            var self = this;

			// TODO: Refactor this to use 'cores/context' once ready. When that happens
			//       the 'cores/component' module (as most other cores) will be significantly restructured.
			
			function forEachComponent (handler) {
    			return LIB.Promise.all(Object.keys(components).map(function (componentId) {
    			    try {
        			    var componentConfig = components[componentId];
        			    var adapter = null;
                        // TODO: Use an in-source declaration to determine the type of component
                        var componentOverrideTemplate = context.getComponentOverrideTemplateForActivePage(componentConfig.id);
                        if (componentOverrideTemplate) {
                            adapter = ADAPTER_CHSCRIPT;
                        } else {
                            adapter = ADAPTER_JQUERY;
                        }
    				    return LIB.Promise.try(function () {
        				    return handler(
        				        componentConfig,
        				        adapter,
        				        context.getComponentForActivePage(componentConfig.id)
        				    );
    				    });
    			    } catch (err) {
    			        return LIB.Promise.reject(err);
    			    }
    			}));
			}

			function loadComponents () {
			    function waitForDataInitialization () {
			        return dataInitialized;
			    }
			    return waitForDataInitialization().then(function () {
    			    return forEachComponent(function (componentConfig, componentAdapter) {
    			        var impl = componentConfig.impl;
    			        if (!impl || impl === 'null') {
    			            return;
    			        }
    			        return context.firewidgets.loadImplementationForPointer(impl);
    			    });
			    });
			}

			function initComponents () {

			    return forEachComponent(function (componentConfig, componentAdapter) {
                    var ComponentContext = function () {
                        var self = this;
                        
                        self.id = componentConfig.id;
                        self.descriptor = {};


                        // Locally persisted component state
                        var state = {};
                        var localStorage = context.contexts.adapters.cache.localStorage;
                        // TODO: Derive this more elegantly from context.
                        var localStorageNamespace = context.contexts.page.getBasePath() + "~" + context.contexts.page.getPath() + "~" + componentConfig.id;
                        var state = {};
                        try {
                            state = JSON.parse(localStorage.get(localStorageNamespace) || "{}");
                        } catch (err) {
                            // TODO: Deal with error.
                        }
                        self.get = function (name) {
                            // TODO: Merge with config options before returning value at name/pointer
                            return state[name];
                        };
                        self.set = function (name, value, options) {
                            options = options || {};
                            if (value === state[name]) return;
                            state[name] = value;
                            // TODO: Warn if value is too large or use alternative method to persist state.
                            localStorage.set(localStorageNamespace, JSON.stringify(state));
                            if (options.notifyChange !== false) {
                                // NOTE: This is needed to prevent rendering bugs in Semantic UI (e.g. dropdown)
                                setTimeout(function () {
                                    self.emit("changed");
                                }, 0);
                            }
                        };
                        
                        // Enable this component to interact with other components on the page.
                        self.getPageComponent = function (id, options) {
                            options = options || {};
                            var comp = context.getComponentForActivePage(id);
                            if (!comp) return null;
                            if (options.watch === true) {
                                // We attach a change listener to the component as we assume we are
                                // dependent on it since we needed it to render the component.
                                // TODO: Declare a more precise dependency in component config.
                                if (!self.getPageComponent._listeners) {
                                    self.getPageComponent._listeners = {};
                                }
                                if (!self.getPageComponent._listeners[id]) {
                                    self.getPageComponent._listeners[id] = function () {
                                        self.emit("changed");
                                    }
                                    comp.on("changed", self.getPageComponent._listeners[id]);
                                }
                            }
                            return comp;
                        }
                        self.getPageComponentsForPrefix = function (prefix) {
                            var components = {};
                            context.getComponentIdsForPrefixForActivePage(prefix).forEach(function (id) {
                                components[id] = self.getPageComponent(id);
                            });
                            return components;
                        }
                        
                        self.getDomNode = function () {
                            return componentConfig.domNode;
                        }
                        
                        self.getPageContext = function () {
                            return context.contexts.container.getPageContext();
                        }

                        // An API the component may expose for access by other components on the same page
                        self.pageAPI = {};

                        // The template for the component
                        self.template = null;

                        // The various component methods
                        self.implAPI = {
                            dataConsumer: null
                        };

                        // NOTE: This IMMUTABLE object gets passed around and will have new data assigned when available
                        //       thus anyone with a reference will have access to the new data.
                        // TODO: Make immutable.
                        self.dataObject = {};
                        if (parentDataObject) {
                            LIB._.merge(self.dataObject, parentDataObject);
                        }
                        
                        self.setData = function (data) {
                            // Re-assign all data keys so anyone with already a reference to 'self.dataObject' gets updates.
                            Object.keys(self.dataObject).forEach(function (name) {
                                delete self.dataObject[name];
                            });
                            LIB._.merge(self.dataObject, data);
                            self.emit("changed");
                        }

                        self.callServerAction = function (action, payload) {

                            // TODO: Support different request formatters.
                            // TODO: Let mapper parse and act on response.

                            var uri = self.implAPI.resolveActionUri(context.contexts.page.getPath(), componentConfig.id, componentConfig.impl);

                            return context.contexts.adapters.request.window.postJSON(uri, {}, {
                                action: action,
                                payload: payload
                            }).then(function(response) {
                    			if (response.status !== 200) {
                    				var err = new Error("Error making request to '" + uri + "'");
                    				err.code = response.status;
                    				throw err;
                    			}
                    			return response.json();
                    		}).then(function (data) {
        
                    		    // See if there is new data to merge into the collections
                    		    if (data.collections) {
                    			    Object.keys(data.collections).forEach(function (collectionName) {
                    			        var collection = context.contexts.data.getCollection(collectionName);
                    			        if (!collection) {
                    			            // TODO: Optionally just issue warning
                    			            throw new Error("Collection with name '" + collectionName + "' needed to store fetched data not found!");
                    			        }
                    			        var add = [];
                    			        var remove = [];
                    			        data.collections[collectionName].forEach(function (record) {
                    			            if (Object.keys(record).length === 1) {
                    			                remove.push(record);
                    			            } else {
                    			                record.id = parseInt(record.id);
                    			                add.push(record);
                    			            }
                    			        });
                    			        if (remove.length > 0) {
                                			collection.store.remove(remove);
                    			        }
                    			        if (add.length > 0) {
                                			collection.store.add(add, {
                                			    merge: true
                                			});
                    			        }
                    			    });
                    		    }

                    		    return data.result || null;
                    		});
                        }

                        self.getDataForPointer = function (pointer) {

                            // TODO: Support different request and response formatters.

                            var uri = self.implAPI.resolveDataUri(context.contexts.page.getPath(), componentConfig.id, componentConfig.impl) + "/" + pointer;

                            return context.contexts.adapters.request.window.get(uri, {}).then(function(response) {
                    			if (response.status !== 200) {
                    				var err = new Error("Error making request to '" + uri + "'");
                    				err.code = response.status;
                    				throw err;
                    			}
                    			return response.json();
                    		});
                        }

                        self.destroy = function () {
                            if (self.implAPI.dataConsumer) {
                                self.implAPI.dataConsumer.removeAllListeners();
                            }
                            self.emit("destroy");
                            self.removeAllListeners();
                        }
                    }
                    ComponentContext.prototype = Object.create(LIB.EventEmitter.prototype);
                    ComponentContext.prototype.contexts = context.contexts;
        
                    
                    var componentContext = new ComponentContext();


                    // ##############################
                    // # Init Component Implementation
                    // ##############################

                    // See if we have a proper firewidget loaded
                    var inheritedImplementation = (componentConfig.impl && context.firewidgets.getImplementationForPointer(componentConfig.impl)) || null;
                    if (inheritedImplementation) {
                        
                        LIB._.merge(componentContext.descriptor, inheritedImplementation.descriptor);

                        var implAPI = inheritedImplementation.newImplementationInstance(componentContext);
                        Object.keys(implAPI).forEach(function (apiContract) {
                            // For now we attach all methods to the object.
                            if (
                                apiContract === "#chscript:redraw" ||
                                apiContract === "#jquery"
                            ) {
                                Object.keys(implAPI[apiContract]).forEach(function (name) {
                                    if (typeof implAPI[apiContract][name] === "function") {
                                        componentContext.implAPI[name] = function () {
                                            var args = Array.prototype.slice.call(arguments);
                                            // Strip leading 'context' argument
                                            if (
                                                name === "mapData" ||
                                                name === "getTemplateData" ||
                                                name === "afterRender"
                                            ) {
                                                args.shift();
                                            }
                                            return implAPI[apiContract][name].apply(this, args);
                                        };
                                    } else {
                                        componentContext.implAPI[name] = implAPI[apiContract][name];
                                    }
                                });
                            } else {
                                console.warn("Ignoring API contract '" + apiContract + "'");
                            }
                        });

                        Object.keys(inheritedImplementation.impl).forEach(function (name) {
                            if (typeof componentContext.implAPI[name] === "undefined") {
                                componentContext.implAPI[name] = inheritedImplementation.impl[name];
                            }
                        });

                    } else {
// TODO: DEPRECATE once all components are loaded via proper firewidgets.
                        // See if we are inheriting from a SEPARATELY LOADED component implementation
                        inheritedImplementation = (componentConfig.impl && context.getComponentInstanceFactory(componentConfig.impl)) || null;
                        if (inheritedImplementation) {
                            LIB._.assign(componentContext.implAPI, new inheritedImplementation({}));
                        }
                    }

                    componentContext.implAPI.resolveActionUri = componentContext.implAPI.resolveActionUri || function (pageUri, componentId, componentImplId) {
                        return "/cores/responder/0.FireWidgets/" +
                            pageUri.replace(/^\//, "").replace(/\//g, "~") + "/" +
                            componentId.replace(/\//g, "~") + "/" +
                            ((componentImplId && componentImplId.replace(/^#0.FireWidgets\//, "").replace(/\//g, "~")) || "") + "/" +
                            "action";
                    }
                    componentContext.implAPI.resolveDataUri = componentContext.implAPI.resolveDataUri || function (pageUri, componentId, componentImplId) {
                        return "/cores/responder/0.FireWidgets/" +
                            pageUri.replace(/^\//, "").replace(/\//g, "~") + "/" +
                            componentId.replace(/\//g, "~") + "/" +
                            ((componentImplId && componentImplId.replace(/^#0.FireWidgets\//, "").replace(/\//g, "~")) || "") + "/" +
                            "data";
                    }

                    var pageImplAPI = context.firewidgets.getImplementationForPage(
			            context.contexts.page.getPath(),
			            componentConfig.id
			        );
			        if (pageImplAPI) {

                        LIB._.merge(componentContext.descriptor, pageImplAPI.descriptor);

                        pageImplAPI = pageImplAPI.newImplementationInstance(componentContext);
                        if (pageImplAPI["#chscript:redraw"]) {
    					    Object.keys(pageImplAPI["#chscript:redraw"]).forEach(function (name) {
                                if (typeof pageImplAPI["#chscript:redraw"][name] === "function") {
                                    componentContext.implAPI[name] = function () {
                                        var args = Array.prototype.slice.call(arguments);
                                        // Strip leading 'context' argument
                                        args.shift();
                                        return pageImplAPI["#chscript:redraw"][name].apply(this, args);
                                    };
                                } else {
                                    componentContext.implAPI[name] = pageImplAPI["#chscript:redraw"][name];
                                }
                            });
                        }
                        /*
						LIB.traverse(pageImplAPI["#chscript:redraw"]).forEach(function () {
							if (typeof this.node === "function") {
								LIB.traverse(componentContext.implAPI).set(this.path, this.node);
							}
						});
					    */
			        } else {
    
                        // See if the page brought along any component implementation functions
                        // These functions may override the one from the inherited implementation
                        // TODO: Setup proper component inheritance with super access so page overrides
                        //       can properly interact with inherited component.
                        var pageImplementation = context.getComponentScript(componentConfig.id);
                        if (pageImplementation) {
                            try {
                                pageImplementation({
                                    wireComponent: function (wiring) {
                                        LIB._.assign(componentContext.implAPI, wiring);
                                    }
                                });
                            } catch (err) {
                                console.error("Error wiring component using script:", err.stack);
                                throw err;
                            }
                        }
                    }


                    // ##############################
                    // # Init Component Template
                    // ##############################

                    if (componentAdapter["#api"] === "component/firewidgets/adapter/chscript") {
                        // TODO: Move into adapter.

                        // 'componentContext.implAPI.templateChscript' now holds the inherited impl if it is there.
                        // If the inherited component implements the tempalte we use it.
                        // TODO: Pass template from page to inherited component to override or add section implementations.
                        if (componentContext.implAPI.template) {
                            componentContext.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(
                                componentContext.implAPI.template.getLayout()
                            );
                        } else
                        if (componentContext.implAPI.templateChscript) {
                            componentContext.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(
                                componentContext.implAPI.templateChscript.getLayout()
                            );
                        } else {
                            // If the page declares a template use it that.
                            var pageOverrideTemplate = context.getComponentOverrideTemplateForActivePage(componentConfig.id);
                            if (typeof pageOverrideTemplate.buildVTree === "function") {
                                componentContext.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(pageOverrideTemplate);
                            } else {
                                throw new Error("Did not find 'buildVTree()' in 'pageOverrideTemplate'!");
                            }
                        }
                    } else
                    if (componentAdapter["#api"] === "component/firewidgets/adapter/jquery") {
                        componentContext.template = new context.contexts.adapters.template.firewidgets.jQueryTemplate();
                    } else {
                        throw new Error("Unknown component adapter API '" + componentAdapter["#api"] + "'");
                    }
                    componentContext.template.attachDomNode(componentConfig.domNode);


                    function ensureDepends () {
                        if (
                            !componentContext.descriptor ||
                            !componentContext.descriptor["@depends"] ||
                            !componentContext.descriptor["@depends"]["page.component"]
                        ) return LIB.Promise.resolve();
                        return LIB.Promise.all(componentContext.descriptor["@depends"]["page.component"].map(function (extendingComponentId) {
                            console.log("Component '" + componentConfig.id + "' is waiting for component '" + extendingComponentId + "' to initialize");
                            return context.getComponentForActivePageAsync(extendingComponentId).then(function () {
                                console.log("Component '" + extendingComponentId + "' that component '" + componentConfig.id + "' is waiting for has initialize!");
                            });
                        }));
                    }
                    
                    return ensureDepends().then(function () {

                        // ##############################
                        // # Init Component Data Mapping
                        // ##############################
    
                        if (typeof componentContext.implAPI.mapData === "function") {
                            // TODO: Make which adapter to use configurable when refactoring to use ccjson
                            var dataConsumer = new (context.contexts.adapters.data["ccjson.record.mapper"]).Consumer();
                            // TODO: Make congigurable
                            dataConsumer.setSourceBaseUrl(
                                componentContext.implAPI.resolveDataUri(context.contexts.page.getPath(), componentConfig.id, componentConfig.impl)
                            );
                            dataConsumer.mapData(componentContext.implAPI.mapData(componentContext, dataConsumer));
    
                            dataConsumer.on("changed", function (event) {
                                componentContext.emit("changed");
                            });
    
                            componentContext.implAPI.dataConsumer = dataConsumer;
                        }

                        context.registerComponentForActivePage(componentContext);
    
    					context.contexts.container.once("destroy", function () {
    						componentContext.destroy();
    					});
                        return;
                    });
			    });
			}
			
			function loadData () {
			    return forEachComponent(function (componentConfig, componentAdapter, componentContext) {
			        return LIB.Promise.try(function () {

			            if (typeof componentContext.implAPI.ensureData === "function") {
			                return componentContext.implAPI.ensureData().then(function (data) {
                                // Re-assign all data keys so anyone with already a reference to 'componentContext.dataObject' gets updates.
                                Object.keys(componentContext.dataObject).forEach(function (name) {
                                    delete componentContext.dataObject[name];
                                });
                                LIB._.assign(componentContext.dataObject, data);
			                });
			            }

                        if (!componentContext.implAPI.dataConsumer) {
                            return;
                        }
                        return componentContext.implAPI.dataConsumer.ensureLoaded();
			        });
			    });
			}

			function setupRendering () {
			    return forEachComponent(function (componentConfig, componentAdapter, componentContext) {
			        return LIB.Promise.try(function () {

			            function syncLatestData () {
			                // NOTE: This is all SYNCHRONOUS! If you need to get data SYNC use a 'dataConsumer'
			                try {
    			                if (componentContext.implAPI.dataConsumer) {
                                    // Re-assign all data keys so anyone with already a reference to 'componentContext.dataObject' gets updates.
                                    Object.keys(componentContext.dataObject).forEach(function (name) {
                                        delete componentContext.dataObject[name];
                                    });
                                    LIB._.assign(componentContext.dataObject, componentContext.implAPI.dataConsumer.getData());
    			                }
/*
                            // TODO: Compare data objects to see if changed.
                            // TODO: Compare state to see if changed.
                            // TODO: Make sure 'dataObject' records serialize properly for comparison.
                            if (fillComponent._previousDataObject) {
                                // TODO: Make 'dataObject immutable and compute checksum so we can compare checksums'
                                if (JSON.stringify(componentContext.dataObject) === fillComponent._previousDataObject) {
                                    // We do not fill as data has not changed.
                                    // State changes should be handled in the markup callback.
                                    return;
                                }
                            }
                            fillComponent._previousDataObject = JSON.stringify(componentContext.dataObject);
*/
                                if (
                                    !componentContext.implAPI.getTemplateData ||
                                    componentAdapter["#api"] !== "component/firewidgets/adapter/chscript"
                                ) {
                                    return;
                                }

                                // Re-assign all data keys so anyone with already a reference to 'componentContext.dataObject' gets updates.
                                var dataObject = LIB._.assign({}, componentContext.dataObject);
                                Object.keys(componentContext.dataObject).forEach(function (name) {
                                    delete componentContext.dataObject[name];
                                });
                                function flattenDataObject (dataObject) {
                                    // We remove all 'get' indirection and return a plain JS / JSONifiable object
                                    var data = LIB._.cloneDeep(dataObject);
                                    LIB.traverse(data).forEach(function () {
                                        // TODO: Flatten the various record types.
        							    if (
        							        typeof this.node === "object" &&
        							        this.node.attributes &&
        							        this.node.collection &&
        							        this.node.collection._byId
        							    ) {
        							        this.parent.node[this.key] = {};
                                            LIB._.assign(this.parent.node[this.key], this.node.attributes);
        							    } else
            							if (typeof this.node === "function") {
            							    if (this.key === "get") {
                                                delete this.parent.node.get;
                                                LIB._.assign(this.parent.node, this.node("*"));
            							    } else {
// TODO: Only log in debug mode.
//            							        console.log("Ignore function '" + this.key + "' at '" + this.path.join(".") + "' as we are only calling 'get' functions.");
            							    }
            							} else {
//            								LIB.traverse(data).set(this.path, this.node);
            							}
            						});
            						return data;
                                }
                                LIB._.assign(componentContext.dataObject, componentContext.implAPI.getTemplateData.call(
                                    null,
                                    componentContext,
                                    flattenDataObject(dataObject)
                                ));
			                } catch (err) {
			                    console.error("Error getting latest data for component '" + componentConfig.id + "':", err.stack);
			                    throw err;
			                }
			            }

                        // Called every time data CHANGES
                        function fill () {
                            if (!componentContext.implAPI.fill) return;
                            if (!fill._helpers) {
                                fill._helpers = {};
                                var templateComponentHelpers = componentContext.template.getComponentHelpers();
                                Object.keys(templateComponentHelpers).forEach(function (name) {
                                    fill._helpers[name] = function () {
                                        var args = Array.prototype.slice.call(arguments);
                                        args.unshift(componentContext);
                                        return templateComponentHelpers[name].apply(null, args);
                                    }
                                });
                            }
                            componentContext.implAPI.fill.call(
                                fill._helpers,
                                componentContext,
                                componentConfig.domNode,
                                componentContext.dataObject
                            );
                            return;
                        }

                        // Called ONCE
                        function markup () {
                            if (!componentContext.implAPI.markup) return;

                            // We only markup once
                            if (markup._didMarkup) return;
                            markup._didMarkup = true;

                            componentContext.implAPI.markup(
                                componentContext,
                                componentConfig.domNode,
                                componentContext.dataObject
                            );
                            return;
                        }

                        function afterRender () {
                            if (!afterRender._helpers) {
                                afterRender._helpers = {
                                    findActionableNode: function (target) {
                                        var elm = $(target);
                                        if (elm.length === 0) return null;
                                        var action = elm.attr("data-component-action");
                                        if (!action) {
                                            return afterRender._helpers.findActionableNode(elm.parent());
                                        }
                                        return {
                                            action: action,
                                            id: elm.attr("data-id")
                                        };
                                    }
                                };
                            }
                            if (componentContext.implAPI.afterRender) {
                                componentContext.implAPI.afterRender.call(
                                    afterRender._helpers,
                                    componentContext,
                                    componentConfig.domNode,
                                    componentContext.dataObject
                                );
                            }

                            context.emit("rendered:component", componentContext);

                            return;
                        }

                        function render () {

                			// We render SYNCHRONOUSLY as all data should be ready now
                			// When new data comes in we re-render.

                            syncLatestData();

                            if (componentAdapter["#api"] === "component/firewidgets/adapter/chscript") {

                                var dataObject = componentContext.dataObject;

                                dataObject["$anchors"] = dataObject["$anchors"] || function (name) {
                                    if (
                                        componentContext.implAPI.template &&
                                        componentContext.implAPI.template.getComponents
                                    ) {
                                        var comps = componentContext.implAPI.template.getComponents();
                                        if (comps[name]) {
                                            return comps[name].buildVTree(
                                                context.contexts.adapters.template.firewidgets.h,
                                                // NOTE: We use the same controlling state as the parent component by default.
                                                //       This allows for controlling sub-components within parent components
                                                //       where sub-components do not need their own controlling implementation.
                                                //       If sub-components are used elsewhere they can be associated with an implementation.
                                                context.contexts.adapters.template.firewidgets.ch(dataObject)
                                            );
                                        }
                                    }
                                    // TODO: Get sub-component to render itself by running the chscript and returning it.
                                    //       At the moment the DOM is parsed after the parent component has finished
                                    //       rendering to find the sub components and init them. This is slower
                                    //       and has more overhead that it would have if doing directly here.
                                    //       This is needed especially when many sub-components are present.
                                    //       NOTE: The code above may partially fulfill this original requirement.
                                    return "";
                                }

                                componentContext.template.render(dataObject);

                                afterRender();

                            } else
                            if (componentAdapter["#api"] === "component/firewidgets/adapter/jquery") {

                                fill();
                                markup();

                            } else {
                                throw new Error("Unknown component adapter API '" + componentAdapter["#api"] + "'");
                            }
                        }

        			    function initSubComponents () {
        			        if (!initSubComponents._initializedComponents) {
        			            initSubComponents._initializedComponents = {};
        			        }
        			        // TODO: Re-use firewidgets container helper.
                            var components = {};
                            $('[data-component-anchor-id]', componentConfig.domNode).each(function () {
                    			var componentElement = $(this);
                    			var componentId = componentElement.attr("data-component-id");
                    			components[componentId] = {
                    			    id: componentId,
                    			    impl: componentElement.attr("data-component-impl") || null,
                    			    domNode: componentElement
                    			};
                    		});
                    		// NOTE: For now we need to re-initialize all sub-components every time
                    		//       as the HTML gets destroyed on every render.
                    		// TODO: Cache component context and only re-initialize template rendering logic
                    		//       attached to the new dom node.
							return self.instanciateComponents(components, componentContext.dataObject).catch(function (err) {
								console.error("Error initializing sub-components:", err.stack);
								throw err;
							});
        			    }

        			    function onChange () {
        			        if (!onChange._queue) {
        			            onChange._queue = [];
        			        }
        			        
        			        function renderNextTransaction () {
        			            var transaction = onChange._queue[0];
                                render();
            			        initSubComponents().then(function () {
                                    onChange._queue.shift();
                                    if (onChange._queue.length > 0) {
                                        renderNextTransaction();
                                    }
    							});
        			        }

        			        // TODO: Pass along the transaction identifier for the dataset
        			        //       that is being rendered.
        			        // TODO: Allow cancelling the rendering of a transaction set if
        			        //       a new one comes in.
        			        onChange._queue.push(true);
        			        if (onChange._queue.length === 1) {
        			            renderNextTransaction();
        			        }
        			    }

                        onChange();
                        componentContext.on("changed", function () {
                            try {
                                onChange();
                            } catch (err) {
            			        console.error("Error rendering component '" + componentConfig.id + "' on change:", err.stack);
            			        throw err;
                            }
        			    });

			        }).catch(function (err) {
    			        console.error("Error rendering component '" + componentConfig.id + "':", err.stack);
    			        throw err;
			        });
			    });
			}

			// Load component implementations
			return loadComponents().then(function () {

    			// Setup components so they can reference each other.
    			return initComponents().then(function () {

        			// Load initial data for all components based on component state
        			return loadData().then(function () {

        			    // Setup rendering and re-rendering of template after every state/data change.
        			    return setupRendering();
    			    });
    			});
			});
        }
							
        return new FireWidgetsComponent(context);
    }

    return exports;
}
