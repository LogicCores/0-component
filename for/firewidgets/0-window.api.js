
exports.forLib = function (LIB) {

//    const COMPONENT = require("../../../../lib/firewidgets-for-zerosystem/window.component");
    const DATA_MAPPER  = require("../../../data/for/ccjson.record.mapper/0-window.api").forLib(LIB);

//    const ADAPTER_CHSCRIPT = require("./adapter.chscript").forLib(LIB);
//    const ADAPTER_JQUERY = require("./adapter.jquery").forLib(LIB);

//    const h = LIB.vdom.h;
//    const ch = require("../../../../lib/cvdom/ch");
//    const createElement = LIB.vdom.createElement;

    var exports = {};

    exports.spin = function (context) {


        const COMPONENT_CONTEXT = require("./context").forLib(LIB).spin(context);
        const COMPONENT = require("./component").forLib(LIB).spin(context);


        // HACK: Remove conce components subscribe properly
        // TODO: Set timeout and trigger reject after 10 sec.
        var dataInitialized = {};
        dataInitialized.promise = new LIB.Promise(function (resolve, reject) {
            dataInitialized.resolve = resolve;
            dataInitialized.reject = reject;
        }).then(function () {
            console.log("data initialized!");
            return null;
        });
        context.contexts.data.once("initialized", function () {
            dataInitialized.resolve(null);
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
                                                return resolve(impl);
/*
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
*/
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
//                            adapter = ADAPTER_CHSCRIPT;
                            
                            componentConfig.adapterId = "chscript";
                        } else {
//                            adapter = ADAPTER_JQUERY;
                            componentConfig.adapterId = "jquery";
                        }
    				    return LIB.Promise.try(function () {
        				    return handler(
        				        componentConfig,
        				        context.getComponentForActivePage(componentConfig.id)
        				    );
    				    });
    			    } catch (err) {
    			        return LIB.Promise.reject(err);
    			    }
    			}));
			}

			function loadComponents () {
			    return LIB.Promise.try(function () {
    			    return dataInitialized.promise;
			    }).then(function () {

    			    return forEachComponent(function (componentConfig) {
    			        var impl = componentConfig.impl;
    			        if (!impl || impl === 'null') {
    			            return;
    			        }
    			        return context.firewidgets.loadImplementationForPointer(impl);
    			    });
			    });
			}

			function initComponents () {

			    return forEachComponent(function (componentConfig) {

                    var componentKey = context.contexts.page.getPath().replace(/^\//, "").replace(/\//g, "~") + ":" + componentConfig.id;

                    var componentContext = COMPONENT_CONTEXT.getForKey(componentKey, componentConfig);


                    var component = COMPONENT.getForKey(componentKey, componentContext);


                    if (parentDataObject) {
                        component.context.setData(parentDataObject);
                    }


                    return component.ensureInitialized().then(function () {

                        return component;
                    });
			    });
			}
			
			function loadData () {
			    return forEachComponent(function (componentConfig, component) {
			        return LIB.Promise.try(function () {

			            if (typeof component.context.implAPI.ensureData === "function") {
			                return component.context.implAPI.ensureData().then(function (data) {
			                    component.context.setData(data, true);
			                });
			            }

                        if (!component.context.implAPI.dataConsumer) {
                            return;
                        }
                        return component.context.implAPI.dataConsumer.ensureLoaded();
			        });
			    });
			}

			function setupRendering () {
			    return forEachComponent(function (componentConfig, component) {
			        return LIB.Promise.try(function () {


                        return component.ensureRenderer({
                            instanciateSubComponents: function (components, parentDataObject) {
                                return self.instanciateComponents(components, parentDataObject);
                            }
                        });


			        }).catch(function (err) {
			            console.error("component", component);
    			        console.error("Error setting up component '" + component.id + "' for rendering:", err.stack);
    			        throw err;
			        });
			    });
			}

			// Load component implementations
			return loadComponents().then(function () {

    			// Setup components so they can reference each other.
    			return initComponents().then(function (components) {

        			// Load initial data for all components based on component state
        			return loadData().then(function () {

        			    // Setup rendering and re-rendering of template after every state/data change.
        			    return setupRendering();
    			    }).then(function () {

//console.log("PAGE ALL DONE!!");
    			        
    			        return components;
    			    });
    			});
			});
        }
							
        return new FireWidgetsComponent(context);
    }

    return exports;
}
