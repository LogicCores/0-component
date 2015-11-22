
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var Component = function (componentContext) {
            var self = this;

            self.id = componentContext.id;
            self.context = componentContext;

            self.template = null;


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
                    self.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(
                        componentContext.id,
                        componentContext.implAPI.template.getLayout()
                    );
                } else
                if (componentContext.implAPI.templateChscript) {
                    self.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(
                        componentContext.id,
                        componentContext.implAPI.templateChscript.getLayout()
                    );
                } else {
                    // If the page declares a template use it
                    var pageOverrideTemplate = context.getComponentOverrideTemplateForActivePage(componentContext.id);
                    if (typeof pageOverrideTemplate.buildVTree === "function") {
                        self.template = new context.contexts.adapters.template.firewidgets.VTreeTemplate(
                            componentContext.id,
                            pageOverrideTemplate
                        );
                    } else {
                        throw new Error("Did not find 'buildVTree()' in 'pageOverrideTemplate'!");
                    }
                }
            } else
            if (componentContext.adapterId === "jquery") {
                self.template = new context.contexts.adapters.template.firewidgets.jQueryTemplate();
            } else {
                throw new Error("Unknown component adapter API '" + componentContext.adapterId + "'");
            }
            
            
            
            var initialized = false;
            self.ensureInitialized = function () {

                if (initialized) {
                    return LIB.Promise.resolve();
                }
                initialized = true;

                function ensureDepends () {
                    if (
                        !self.context.descriptor ||
                        !self.context.descriptor["@depends"] ||
                        !self.context.descriptor["@depends"]["page.component"]
                    ) return LIB.Promise.resolve();
                    return LIB.Promise.all(self.context.descriptor["@depends"]["page.component"].map(function (extendingComponentId) {
                        console.log("Component '" + self.context.id + "' is waiting for component '" + extendingComponentId + "' to initialize");
                        return context.getComponentForActivePageAsync(extendingComponentId).then(function () {
                            console.log("Component '" + extendingComponentId + "' that component '" + self.context.id + "' is waiting for has initialize!");
                            return null;
                        });
                    }));
                }

                return ensureDepends().then(function () {

                    // ##############################
                    // # Init Component Data Mapping
                    // ##############################

                    if (typeof self.context.implAPI.mapData === "function") {
                        // TODO: Make which adapter to use configurable when refactoring to use ccjson
                        var dataConsumer = new (context.contexts.adapters.data["ccjson.record.mapper"]).Consumer();
                        // TODO: Make congigurable
                        dataConsumer.setSourceBaseUrl(
                            self.context.implAPI.resolveDataUri(context.contexts.page.getPath(), self.context.id, self.context.implId)
                        );
                        dataConsumer.mapData(self.context.implAPI.mapData(self.context, dataConsumer));

                        dataConsumer.on("changed", function (event) {
                            self.context.emit("changed", {
                                reason: "data.consumer",
                                component: self.context.id,
                                event: event
                            });
                        });

                        self.context.implAPI.dataConsumer = dataConsumer;
                    }

                    context.registerComponentForActivePage(self);
                    return null;
                });
            }
            
            
            var rendererEnsured = false;
            self.ensureRenderer = function (componentHelpers) {

                var component = self;

                if (rendererEnsured) {
                    return LIB.Promise.resolve();
                }
                rendererEnsured = true;

	            function syncLatestData () {
	                // NOTE: This is all SYNCHRONOUS! If you need to get data SYNC use a 'dataConsumer'
	                try {

		                if (component.context.implAPI.dataConsumer) {
		                    component.context.setData(component.context.implAPI.dataConsumer.getData(), true);
		                }

/*
                    // TODO: Compare data objects to see if changed.
                    // TODO: Compare state to see if changed.
                    // TODO: Make sure 'dataObject' records serialize properly for comparison.
                    if (fillComponent._previousDataObject) {
                        // TODO: Make 'dataObject immutable and compute checksum so we can compare checksums'
                        if (JSON.stringify(component.context.dataObject) === fillComponent._previousDataObject) {
                            // We do not fill as data has not changed.
                            // State changes should be handled in the markup callback.
                            return;
                        }
                    }
                    fillComponent._previousDataObject = JSON.stringify(component.context.dataObject);
*/

                        var newData = null;

                        if (
                            !component.context.implAPI.getTemplateData ||
                            component.context.adapterId !== "chscript"
                        ) {
                            newData = component.context.dataObject;
                        } else {
    	                    newData = component.context.implAPI.getTemplateData.call(
                                null,
                                component.context,
                                LIB._.assign({}, component.context.dataObject)
                            );
                        }

	                    component.context.setTemplateData(newData);

	                } catch (err) {
	                    console.error("Error getting latest data for component '" + component.context.id + "':", err.stack);
	                    throw err;
	                }
	            }

                // Called every time data CHANGES
                function fill () {
                    if (!component.context.implAPI.fill) return;
                    if (!fill._helpers) {
                        fill._helpers = {};
                        var templateComponentHelpers = component.template.getComponentHelpers();
                        Object.keys(templateComponentHelpers).forEach(function (name) {
                            fill._helpers[name] = function () {
                                var args = Array.prototype.slice.call(arguments);
                                args.unshift(component.context);
                                return templateComponentHelpers[name].apply(null, args);
                            }
                        });
                    }
                    component.context.implAPI.fill.call(
                        fill._helpers,
                        component.context,
                        component.domNode,
                        component.context.tplData
                    );
                    return;
                }

                // Called ONCE
                function markup () {
                    if (!component.context.implAPI.markup) return;

                    // We only markup once
                    if (markup._didMarkup) return;
                    markup._didMarkup = true;

                    component.context.implAPI.markup(
                        component.context,
                        component.domNode,
                        component.context.tplData
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

                    if (component.context.implAPI.afterRender) {
                        component.context.implAPI.afterRender.call(
                            afterRender._helpers,
                            component.context,
                            component.domNode,
                            component.context.tplData
                        );
                    }

                    context.emit("rendered:component", component.context);

                    return;
                }

                function render () {

        			// We render SYNCHRONOUSLY as all data should be ready now
        			// When new data comes in we re-render.

                    syncLatestData();

                    if (component.context.adapterId === "chscript") {

                        var tplData = component.context.tplData;

                        tplData["$anchors"] = tplData["$anchors"] || function (name) {
                            if (
                                component.context.implAPI.template &&
                                component.context.implAPI.template.getComponents
                            ) {
                                var comps = component.context.implAPI.template.getComponents();
                                if (comps[name]) {
                                    return comps[name].buildVTree(
                                        context.contexts.adapters.template.firewidgets.h,
                                        // NOTE: We use the same controlling state as the parent component by default.
                                        //       This allows for controlling sub-components within parent components
                                        //       where sub-components do not need their own controlling implementation.
                                        //       If sub-components are used elsewhere they can be associated with an implementation.
                                        context.contexts.adapters.template.firewidgets.ch(tplData)
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

                        // Remove all listers which will get re-attached in `afterRender()`
                        component.template.domNode.off();

                        component.template.render(tplData, {
                            forceCompleteRerender: component.context.implAPI.forceCompleteRerender || false
                        });

                        afterRender();

                    } else
                    if (component.context.adapterId === "jquery") {

                        fill();
                        markup();

                    } else {
                        throw new Error("Unknown component adapter ID '" + component.context.adapterId + "'");
                    }
                }


                
                var subComponents = null;
                var reactToChanges = false;

			    function initSubComponents () {
//        			        if (!initSubComponents._initializedComponents) {
//        			            initSubComponents._initializedComponents = {};
//        			        }
			        // TODO: Re-use firewidgets container helper.
                    var components = {};


//                    component.context.implAPI.template &&
//                    component.context.implAPI.template.getComponents



                    $('[data-component-anchor-id]', component.domNode).each(function () {
            			var componentElement = $(this);
            			var componentId = componentElement.attr("data-component-id");
            			components[componentId] = {
            			    id: componentId,
            			    impl: componentElement.attr("data-component-impl") || null,
            			    domNode: componentElement,
            			    container: component.context.container
            			};
            		});
            		// NOTE: For now we need to re-initialize all sub-components every time
            		//       as the HTML gets destroyed on every render.
            		// TODO: Cache component context and only re-initialize template rendering logic
            		//       attached to the new dom node.

					return componentHelpers.instanciateSubComponents(components, component.context.tplData).then(function (_subComponents) {

					    subComponents = _subComponents;

                        subComponents.forEach(function (subComponent) {
                            subComponent.renderTo(components[subComponent.id].domNode);
                        });
                        
                        return null;

					}).catch(function (err) {
						console.error("Error initializing sub-components:", err.stack);
						throw err;
					});
			    }


			    function onChange () {

			        if (LIB.VERBOSE) console.info("Handle onChange() for component '" + component.id + "'");

                    return LIB.Promise.try(function () {
                        
    			        if (!reactToChanges) {
    			            return;
    			        }
    
    			        if (!onChange._queue) {
    			            onChange._queue = [];
    			        }
    			        
    			        function renderNextTransaction () {
    			            var transaction = onChange._queue[0];
    
                            render();
        			        
        			        return initSubComponents().then(function () {
                                onChange._queue.shift();
                                if (onChange._queue.length > 0) {
                                    renderNextTransaction();
                                }
                                return null;
    						});
    			        }
    
    			        // TODO: Pass along the transaction identifier for the dataset
    			        //       that is being rendered.
    			        // TODO: Allow cancelling the rendering of a transaction set if
    			        //       a new one comes in.
    			        onChange._queue.push(true);
    			        if (onChange._queue.length === 1) {
    			            return renderNextTransaction();
    			        }
                    });
			    }

                component.context.on("changed", function (event) {
                    try {
                        onChange();
                    } catch (err) {
    			        console.error("Error rendering component '" + component.context.id + "' on change:", err.stack);
    			        throw err;
                    }
			    });

                
                component.on("show", function () {
                    reactToChanges = true;
                    onChange();
                });
                component.on("hide", function () {
                    reactToChanges = false;
                    subComponents.forEach(function (subComponent) {
                        subComponent.hide();
                    });
                });
//                return onChange();
            }
            
            
            self.renderTo = function (domNode) {
                self.domNode = domNode;
                self.template.attachDomNode(domNode);
                self.emit("show");
            }

            self.hide = function () {
                self.emit("hide");
            }
        }
        Component.prototype = Object.create(LIB.EventEmitter.prototype);
        Component.prototype.contexts = context.contexts;



        var cache = {};

        return {
            Component: Component,
            getForKey: function (componentKey, componentContext) {
                if (
                    !cache[componentKey] ||
                    context.config.alwaysReload !== false
                ) {
//console.info("Init new component for key '" + componentKey + "':", componentContext);
                    cache[componentKey] = new Component(componentContext);
                } else {
//console.log("Use existing component for key:", componentKey);
                    // NOTE: We assume the 'componentConfig' has NOT changed!
                    // TODO: Update ComponentContext if 'componentConfig' has changed or create new ComponentContext?
                }
                return cache[componentKey];
            }
        };
    }

    return exports;
}
