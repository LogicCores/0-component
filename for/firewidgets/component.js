
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var Component = function (componentContext) {
            var self = this;


            // ##############################
            // # Init Component Implementation
            // ##############################

            // See if we have a proper firewidget loaded
            var inheritedImplementation = (componentContext.implId && context.firewidgets.getImplementationForPointer(componentContext.implId)) || null;
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
                inheritedImplementation = (componentContext.implId && context.getComponentInstanceFactory(componentContext.implId)) || null;
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
	            componentContext.id
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
                var pageImplementation = context.getComponentScript(componentContext.id);
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

            if (componentContext.adapterId === "chscript") {
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
                    var pageOverrideTemplate = context.getComponentOverrideTemplateForActivePage(componentContext.id);
                    if (typeof pageOverrideTemplate.buildVTree === "function") {
                        componentContext.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(pageOverrideTemplate);
                    } else {
                        throw new Error("Did not find 'buildVTree()' in 'pageOverrideTemplate'!");
                    }
                }
            } else
            if (componentContext.adapterId === "jquery") {
                componentContext.template = new context.contexts.adapters.template.firewidgets.jQueryTemplate();
            } else {
                throw new Error("Unknown component adapter API '" + componentContext.adapterId + "'");
            }

        }
        Component.prototype = Object.create(LIB.EventEmitter.prototype);
        Component.prototype.contexts = context.contexts;



        var cache = {};

        return {
            Component: Component,
            getForKey: function (componentKey, componentContext) {
                if (!cache[componentKey]) {
console.info("Init new component for key '" + componentKey + "':", componentContext);
                    cache[componentKey] = new Component(componentContext);
                } else {
console.log("Use existing component for key:", componentKey);
                    // NOTE: We assume the 'componentConfig' has NOT changed!
                    // TODO: Update ComponentContext if 'componentConfig' has changed or create new ComponentContext?
                }
                return cache[componentKey];
            }
        };
    }

    return exports;
}
