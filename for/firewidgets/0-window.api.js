
exports.forLib = function (LIB) {

    const COMPONENT = require("../../../../lib/firewidgets-for-zerosystem/window.component");
    const DATA_MAPPER  = require("../../../data/for/ccjson.record.mapper/0-window.api").forLib(LIB);

    var exports = {};

    exports.spin = function (context) {
    
        var FireWidgetsComponent = function () {
            var self = this;
        }

        FireWidgetsComponent.prototype.liftComponentsForPageFragment = function (page, html) {

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
                            context.registerComponentScript(scriptInfo.id, new Function(
                                "context",
                                scriptBuffer.join("\n")
                            ));
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
                } else {
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
                }
                linesOut.push(lines[i]);
            }
            return LIB.Promise.resolve(linesOut.join("\n"));
        }

        FireWidgetsComponent.prototype.instanciateComponent = function (config) {

            var componentImplementation = context.getComponentInstanceFactory(config.impl);

            var component = null;
            if (componentImplementation) {
                component = new componentImplementation({});
            }

            function initTemplate () {
                return LIB.Promise.try(function () {

                    var template = new context.contexts.adapters.template.firewidgets.Template();

                    template.attachDomNode(config.domNode);

                    return template;
                });
            }

            function wireComponent () {

                function loadScriptedWiring () {
                    var script = context.getComponentScript(config.id);
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

                    var componentContext = {};

                    var dataConsumer = null;

                    if (typeof wiring.mapData === "function") {
                        // TODO: Make which adapter to use configurable when refactoring to sue ccjson
                        dataConsumer = new (context.contexts.adapters.data["ccjson.record.mapper"]).Consumer();

                        // TODO: Make congigurable
                        dataConsumer.setSourceBaseUrl("/api/page" + context.contexts.page.getPath() + "/firewidgets/" + config.id + "/pointer");

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

                var localStorage = context.contexts.adapters.cache.localStorage;
                // TODO: Derive this more elegantly from context.
                var localStorageNamespace = context.contexts.page.getBasePath() + "~" + context.contexts.page.getPath() + "~" + config.id;

                var componentState = {};
                try {
                    componentState = JSON.parse(localStorage.get(localStorageNamespace) || "{}");
                } catch (err) {
                    // TODO: Deal with error.
                }

                var componentContext = {
                    get: function (name) {
                        return componentState[name];
                    },
                    set: function (name, value) {
                        componentState[name] = value;
                        // TODO: Warn if value is too large or use alternative method to persist state.
                        localStorage.set(localStorageNamespace, JSON.stringify(componentState));
                    }
                };

                var dataObject = {};

                var fillHelpers = {};
                var templateComponentHelpers = template.getComponentHelpers();
                Object.keys(templateComponentHelpers).forEach(function (name) {
                    fillHelpers[name] = function () {
                        var args = Array.prototype.slice.call(arguments);
                        args.unshift(componentContext);
                        return templateComponentHelpers[name].apply(null, args);
                    }
                });


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

                function ensureDataLoaded (fillComponentTrigger) {
                    if (!wiring.dataConsumer) {
                        return LIB.Promise.resolve();
                    }
                    return wiring.dataConsumer.ensureLoaded().then(function () {
                        wiring.dataConsumer.on("changed", function () {
                            fillComponentTrigger();
                        });
                    });
                }

                // Called every time data CHANGES
                function fillComponent () {
                    return LIB.Promise.try(function () {
                        if (!wiring.fill) return;

                        // Re-assign all data keys
                        Object.keys(dataObject).forEach(function (name) {
                            delete dataObject[name];
                        });
                        if (wiring.dataConsumer) {
                            LIB._.assign(dataObject, wiring.dataConsumer.getData());
                        }

                        return wiring.fill.call(
                            fillHelpers,
                            componentContext,
                            config.domNode,
                            dataObject
                        );
                    });
                }

                // First we fill the component with data
                return ensureDataLoaded(fillComponent).then(function() {
                    return fillComponent();
                }).then(function () {
                    // Then we mark up the component once
                    return markupComponent();
                })
// TODO: Merge wiring with component using backbone extends
                .then(function () {

                    var Component = function () {
                    }
                    
                    var component = new Component();

                    component.destroy = function () {
                        if (wiring.dataConsumer) {
                            wiring.dataConsumer.removeAllListeners();
                        }
                    }

                    return component;
                });
            });
        }

        return new FireWidgetsComponent(context);
    }

    return exports;
}
