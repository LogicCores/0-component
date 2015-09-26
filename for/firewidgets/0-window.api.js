
exports.forLib = function (LIB) {

    const COMPONENT = require("../../../../lib/firewidgets-for-zerosystem/window.component");
    const DATA_MAPPER  = require("../../../data/for/ccjson.record.mapper/0-window.api").forLib(LIB);

    const h = LIB.vdom.h;
    const ch = require("../../../../lib/cvdom/ch");
    const createElement = LIB.vdom.createElement;

    var exports = {};

    exports.spin = function (context) {
    
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
                                                    impl.getScripts().forEach(function (scriptInfo) {
                                                        context.registerComponentScript(scriptInfo.id, new Function(
                                                            "context",
                                                            scriptInfo.code
                                                        ));
                                                    });
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

        FireWidgetsComponent.prototype.instanciateComponent = function (config) {

//console.log("instanciateComponent config", config);

            var componentImplementation = context.getComponentInstanceFactory(config.impl);

//console.log("instanciateComponent componentImplementation", componentImplementation);

            var component = null;
            if (componentImplementation) {
                component = new componentImplementation({});
            }


            var ComponentContext = function () {
                var self = this;
                
                var state = {};

                var localStorage = context.contexts.adapters.cache.localStorage;
                // TODO: Derive this more elegantly from context.
                var localStorageNamespace = context.contexts.page.getBasePath() + "~" + context.contexts.page.getPath() + "~" + config.id;
    
                var state = {};
                try {
                    state = JSON.parse(localStorage.get(localStorageNamespace) || "{}");
                } catch (err) {
                    // TODO: Deal with error.
                }
                
                // An API the component may expose for access by other components on the same page
                self.pageAPI = {};
                

                self.get = function (name) {
                    return state[name];
                };
                self.set = function (name, value) {
                    if (value === state[name]) return;
                    state[name] = value;
                    self.emit("changed");
                    // TODO: Warn if value is too large or use alternative method to persist state.
                    localStorage.set(localStorageNamespace, JSON.stringify(state));
                };

                var pageComponents = {};
                self.getPageComponent_P = function (id) {
                    return context.getComponentForActivePage(id).then(function (component) {
                        pageComponents[id] = component;
                        return component;
                    })
                }
                self.getPageComponent = function (id) {
                    return pageComponents[id];
                }

                self.callServerAction = function (action, payload) {

                    // TODO: Support different request formatters.

                    var uri = "/api/page" + context.contexts.page.getPath() + "/firewidgets/" + config.id + "/action";

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
                    			collection.store.add(data.collections[collectionName], {
                    			    merge: true
                    			});
            			    });
            		    }

            		    return data.result || null;
            		});
                }
            }
            ComponentContext.prototype = Object.create(LIB.EventEmitter.prototype);
            ComponentContext.prototype.contexts = context.contexts;

            var componentContext = new ComponentContext();


            var componentOverrideTemplate = context.getComponentOverrideTemplateForActivePage(config.id);
//console.log("componentOverrideTemplate", componentOverrideTemplate);


            function initTemplate () {
                return LIB.Promise.try(function () {
                    var template = null;

//console.log("componentOverrideTemplate", componentOverrideTemplate);
//console.log("component", component.templateChscript);
                    if (componentOverrideTemplate) {
                        // If component impl ships its own template we use it.
                        if (
                            component &&
                            component.templateChscript
                        ) {
                            // TODO: Pass template from page to component to override or add section implementations.
    //console.log("layout", component.templateChscript.getLayout());
                            template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(
                                component.templateChscript.getLayout()
                            );
                        } else {
                            if (typeof componentOverrideTemplate.buildVTree === "function") {
                                template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(componentOverrideTemplate);
                            } else {
                                throw new Error("'componentOverrideTemplate' object type not supported!");
                            }
                        }
                    } else {
                        template = new context.contexts.adapters.template.firewidgets.jQueryTemplate();
                    }
                    template.attachDomNode(config.domNode);
                    return template;
                });
            }

            function wireComponent () {

                function loadScriptedWiring () {
                    var script = context.getComponentScript(config.id);

//console.log("scripted wiring", config.id, script);

                    if (!script) return LIB.Promise.resolve({});
                    return new LIB.Promise(function (resolve, reject) {
                        try {
                            script({
                                wireComponent: function (wiring) {
                                    return resolve(wiring);
                                }
                            });
                        } catch (err) {
                            console.error("Error wiring component using script:", err.stack);
                            return reject(err);
                        }
                    });
                }
                
                return loadScriptedWiring().then(function (_wiring) {

                    var wiring = {};
                    if (component) {
                        LIB._.assign(wiring, component);
                    }
                    LIB._.assign(wiring, _wiring);

                    var dataConsumer = null;

                    if (typeof wiring.mapData === "function") {
                        // TODO: Make which adapter to use configurable when refactoring to sue ccjson
                        dataConsumer = new (context.contexts.adapters.data["ccjson.record.mapper"]).Consumer();

                        // TODO: Make congigurable
                        dataConsumer.setSourceBaseUrl("/api/page" + context.contexts.page.getPath() + "/firewidgets/" + config.id + "/pointer");
//console.log("MAP DATA", config.id);
                        dataConsumer.mapData(wiring.mapData(componentContext, dataConsumer));
                    }

                    return LIB._.assign(wiring, {
                        dataConsumer: dataConsumer
                    });
                });
            }

            return LIB.Promise.all([
                wireComponent(),
                initTemplate()
            ]).spread(function (wiring, template) {
                
                var dataFetchedTime = null;

                var dataObject = {};

                function ensureDataLoaded (_fillComponentTrigger) {
                    if (!wiring.dataConsumer) {
                        componentContext.on("changed", function () {
//console.log("NOTIFY: component context changed", event);
                            _fillComponentTrigger()();
                        });
                        return LIB.Promise.resolve();
                    }
                    var consumerReady = false;
                    function fillComponentTrigger () {
                        if (!consumerReady) return function () {};
                        return _fillComponentTrigger();
                    }
                    return wiring.dataConsumer.ensureDepends({
                        getPageComponent: function (id) {

//console.log("GET PAGE COMPONENT ...", config.id, id);                            
                            return componentContext.getPageComponent_P(id).then(function (component) {
//console.log("  GOT PAGE COMPONENT", config.id, id);                            
                                component.on("changed", function () {
//console.log("NOTIFY: page comp changed", event);
                                    fillComponentTrigger()();
                                });
                                return component;
                            });
                        }
                    }).then(function () {

//console.log("  GOT ALL PAGE COMPONENTS!!", config.id);                            

                        return wiring.dataConsumer.ensureLoaded().then(function () {
                            wiring.dataConsumer.on("changed", function (event) {

                                // We ignore the event if it was from before our last fetch.
                                // The event comes in later as it may be debounced.
                                if (event.time < dataFetchedTime) {

//console.log("IGNORE: data consumer changed", event, dataFetchedTime);

                                } else {
//console.log("NOTIFY: data consumer changed", event, dataFetchedTime);
                                    fillComponentTrigger()();
                                }
                            });
                            componentContext.on("changed", function () {
//console.log("NOTIFY: component context changed", event);
                                fillComponentTrigger()();
                            });
                        });
                    }).then(function () {
                        consumerReady = true;
                    });
                }


                // Called ONCE
                function markupComponent () {
                    return LIB.Promise.try(function () {
                        if (!wiring.markup) return;
                        return wiring.markup(
                            componentContext,
                            config.domNode,
                            dataObject
                        );
                    });
                }


                function syncData () {
                    // Re-assign all data keys
                    Object.keys(dataObject).forEach(function (name) {
                        delete dataObject[name];
                    });
                    if (wiring.dataConsumer) {
//console.log(" TRIGGER GET DATA for SYNC", config.id);                        
                        LIB._.assign(dataObject, wiring.dataConsumer.getData());
                        dataFetchedTime = Date.now();
//console.log(" ... got DATA!!", dataObject);                        
                    }
                }

                var fillHelpers = {};
                // Called every time data CHANGES
                function fillComponent () {
                    return LIB.Promise.try(function () {
                        if (!wiring.fill) return;

//console.log(" TRIGGER SYNC DATA DUE TO FILL", config.id);                        
                        syncData();

                        // TODO: Make sure 'dataObject' records serialize properly.
                        if (fillComponent._previousDataObject) {
                            // TODO: Make 'dataObject immutable and compute checksum so we can compare checksums'
                            if (JSON.stringify(dataObject) === fillComponent._previousDataObject) {
                                // We do not fill as data has not changed.
                                // State changes should be handled in the markup callback.
                                return;
                            }
                        }
                        fillComponent._previousDataObject = JSON.stringify(dataObject);

                        return wiring.fill.call(
                            fillHelpers,
                            componentContext,
                            config.domNode,
                            dataObject
                        );
                    });
                }
                
                

                function renderComponentOverrideTemplate () {
//console.log("render comp override START", config.id);                            

                    function getTemplateControllingData () {
                        return LIB.Promise.try(function () {
//console.log(" TRIGGER SYNC DATA DUE TO getTemplateControllingData", config.id);                        
                            syncData();
                            if (!wiring.getTemplateData) {
                                return dataObject;
                            }
                            return wiring.getTemplateData.call(
                                null,
                                componentContext,
                                dataObject
                            );
                        });
                    }
                    function afterRender () {
                        return LIB.Promise.try(function () {
                            if (!wiring.afterRender) {
                                return;
                            }
                            var helpers = {
                              findActionableNode: function (target) {
                                var elm = $(target);
                                if (elm.length === 0) return null;
                                var action = elm.attr("data-component-action");
                                if (!action) {
                                  return helpers.findActionableNode(elm.parent());
                                }
                                return {
                                  action: action,
                                  id: elm.attr("data-id")
                                };
                              }
                            }
//console.log("trigger after render", config.id);       


                            return wiring.afterRender.call(
                                helpers,
                                componentContext,
                                config.domNode,
                                dataObject
                            );
                        });
                    }
                    return getTemplateControllingData().then(function (data) {
                        template.render(data);
                        return afterRender(data);
                    }).then(function () {

//console.log("render comp override DONE", config.id);                            
                        
                    });
                }

                function syncComponentOverrideTemplate () {

//console.log("SYNC COMPONENT!", config.id);                    
                    return renderComponentOverrideTemplate();
                }

                function renderWidget () {

                    // Managed templates
                    if (componentOverrideTemplate) {
                        return renderComponentOverrideTemplate();
                    }

                    // DOM-based templates
                    var templateComponentHelpers = template.getComponentHelpers();
                    Object.keys(templateComponentHelpers).forEach(function (name) {
                        fillHelpers[name] = function () {
                            var args = Array.prototype.slice.call(arguments);
                            args.unshift(componentContext);
                            return templateComponentHelpers[name].apply(null, args);
                        }
                    });
                    return fillComponent().then(function () {
                        // Then we mark up the component once
                        return markupComponent();
                    });
                }

                // First we fill the component with data
                return ensureDataLoaded(function () {
                    return componentOverrideTemplate ?
                        syncComponentOverrideTemplate :
                        fillComponent
                }).then(function() {
                    renderWidget();
                })
                .then(function () {

                    var Component = function () {
                        var self = this;

                        self.id = config.id;

                        self.get = function (name) {
                            // TODO: Merge with config options before returning value at pointer
                            return componentContext.get(name);
                        }

                        componentContext.on("changed", function () {
                            self.emit("changed");
                        });
                    }
                    Component.prototype = Object.create(LIB.EventEmitter.prototype);

                    var component = new Component();

                    if (wiring.dataConsumer) {
                        wiring.dataConsumer.on("changed", function () {
                            component.emit("changed");
                        });
                    }

                    component.destroy = function () {
                        if (wiring.dataConsumer) {
                            wiring.dataConsumer.removeAllListeners();
                        }
                        this.emit("destroy");
                    }
                    
                    component.api = componentContext.pageAPI;

                    context.registerComponentForActivePage(component);

                    return component;
                });
            });
        }

        return new FireWidgetsComponent(context);
    }

    return exports;
}
