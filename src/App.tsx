import * as flow from "@xyflow/react";
import * as tone from "tone";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiDeleteBinFill, RiFileCheckFill, RiFileMusicFill, RiGraduationCapFill, RiImportFill, RiLinkM, RiLinkUnlinkM, RiPlayFill, RiSaveFill, RiSettings3Fill, RiStopFill } from "@remixicon/react";

import "@xyflow/react/dist/style.css";

import { VESTIGE_NODE_SERIALIZERS, VESTIGE_NODE_TYPES, type VestigeNode } from "./nodes";
import { createFinalNode } from "./nodes/FinalNode";

import { VestigeGraph, GraphMutator, graphFromExisting } from "./graph";
import { deserializeProject, deserializeBase64Project, serializeProject, serializeBase64Project } from "./serializer";
import { getPersistentData, mutatePersistentData, PersistentData } from "./persistent";
import { isTauri, promptToSaveFile } from "./environment";

import { IntroductionTour } from "./components/IntroductionTour";
import { disposeNode, toggleNodeCollapsed } from "./components/VestigeNodeBase";
import { SettingsDialog } from "./components/app/SettingsDialog";
import { SelectionMenu } from "./components/app/SelectionMenu";
import { copyNodes, getClipboard, instantiateSnapshot, NodeSnapshot, snapshotNodes } from "./clipboard";
import { EDGE_TYPES as VESTIGE_EDGE_TYPES } from "./components/VestigeEdge";
import { AddNodeMenu } from "./components/app/AddNodeMenu";
import { HelpPanel, NODE_PAGES } from "./components/app/HelpPanel";
import { HelpContext, HelpPage } from "./components/app/HelpContext";
import { AppRenderDialog } from "./components/app/AppRenderDialog";
import { ConfirmationDialog } from "./components/app/ConfirmationDialog";
import { AppProjectLinkDialog } from "./components/app/AppProjectLinkDialog";

const shouldShowTour = !getPersistentData().tourComplete;
const shouldLoadExisting = location.hash.startsWith("#p:");

/** The distance between the top of a newly added node and the cursor, in pixels. */
const NEW_NODE_OFFSET = 20;

const DEFAULT_VIEWPORT = { x: 500, y: 210, zoom: 1 };

/** Returns `true` if the given event target accepts keyboard input on its own. */
function isTextInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement))
    return false;

  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export default function App() {
  const [thisFlow, setThisFlow] = useState<flow.ReactFlowInstance<VestigeNode, flow.Edge> | null>(null);
  const [viewport, setViewport] = useState<flow.Viewport>(DEFAULT_VIEWPORT);

  const [startTimeMs, setStartTimeMs] = useState(performance.now());
  const [playing, setPlaying] = useState(false);

  const [wasStarted, setWasStarted] = useState(false);
  const [connectedFinalBefore, setConnectedFinalBefore] = useState(false);

  let [graph, setGraph] = useState(new VestigeGraph());
  const [graphVer, setGraphVer] = useState(0);

  const [ctxMenuPos, setCtxMenuPos] = useState({ x: 0, y: 0 });
  const [showCtxMenu, setShowCtxMenu] = useState(false);
  const [selectionMenuPos, setSelectionMenuPos] = useState<{ x: number, y: number } | null>(null);
  const mousePos = useRef({ x: 0, y: 0 });

  const [settings, setSettings] = useState(getPersistentData());
  const settingsDialogRef = useRef<HTMLDialogElement>(null);

  function changeSettings(changes: Partial<PersistentData>) {
    mutatePersistentData(changes);
    setSettings(getPersistentData());
  }

  const [helpPage, setHelpPage] = useState<HelpPage | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const helpContext = useMemo(() => ({
    show(page: HelpPage) {
      // The article from the help center also has an icon and a category, so we prefer it.
      setHelpPage(NODE_PAGES.find(x => x.title == page.title) ?? page);
      setHelpOpen(true);
    }
  }), []);

  const tourDialogRef = useRef<HTMLDialogElement>(null);
  const resetDialogRef = useRef<HTMLDialogElement>(null);
  const renderDialogRef = useRef<HTMLDialogElement>(null);

  const [projLink, setProjLink] = useState<string>("");
  const [inTour, setInTour] = useState(false);

  const [realtimeCtx] = useState(tone.getContext());

  const togglePlay = useCallback(async () => {
    if (!playing) {
      setStartTimeMs(performance.now());

      if (!wasStarted) {
        console.log("▶️ Playing (performing first time initialization)");
        await tone.start();
        setWasStarted(true);
      } else {
        console.log("▶️ Playing");
        tone.getDestination().volume.rampTo(tone.gainToDb(1), 0.25);
      }
    } else {
      console.log("⏹️ Stopping");
      tone.getDestination().volume.rampTo(-Infinity, 0.25);
    }

    setPlaying(!playing);
  }, [playing, wasStarted]);

  const mutator = useMemo(() => new GraphMutator({
    onSignalConnect(_src, dst) {
      if (dst.nodeType != "FINAL")
        return;

      if (!connectedFinalBefore) {
        if (!playing) {
          togglePlay();
        }

        setConnectedFinalBefore(true);
     } 
    }
  }), [connectedFinalBefore, playing, togglePlay]);

  useEffect(() => {
    window.addEventListener("hashchange", () => {
      if (location.hash.startsWith("#p:") || location.hash.startsWith("#tour")) {
        location.reload();
      }
    });
  }, []);

  useEffect(() => {
    if (!playing)
      return;

    const handler = () => {
      const now = realtimeCtx.now();
      graph.nodes.forEach(x => x.data.onTick?.(now));
    };

    realtimeCtx.on("tick", handler);
    return () => { realtimeCtx.off("tick", handler); }
  }, [realtimeCtx, graphVer, playing]);

  useEffect(() => {
    if (!shouldLoadExisting) 
      return;

    (async () => {
      const data = location.hash.substring(3);
      const result = await deserializeBase64Project(data, VESTIGE_NODE_SERIALIZERS);
  
      setGraph(graphFromExisting(result.nodes, result.edges));
  
      console.log("✅ Successfully loaded project from URL.", result);
      location.hash = "";
    })();
  }, []);

  function handleContextMenuOpen(ev: React.MouseEvent<HTMLDivElement>) {
    setCtxMenuPos({ x: ev.pageX, y: ev.pageY });
    setShowCtxMenu(true);
    ev.preventDefault();
  }

  function handleMouseMove(ev: React.MouseEvent<HTMLElement>) {
    mousePos.current = { x: ev.pageX, y: ev.pageY };
  }

  /**
   * Adds the nodes of the given snapshot to the graph, selecting them, and deselecting
   * all other nodes. If `atCursor` is `true`, the nodes are placed at the mouse cursor.
   */
  async function insertSnapshot(snapshot: NodeSnapshot, atCursor: boolean) {
    const position = atCursor && thisFlow ? thisFlow.screenToFlowPosition(mousePos.current) : null;
    const { nodes, edges } = await instantiateSnapshot(snapshot, position);

    setGraph(mutator.mutate(graph, {
      nodes: [...graph.nodes.map(x => ({ ...x, selected: false })), ...nodes],
      edges: [...graph.edges, ...edges]
    }));

    setGraphVer(x => x + 1);
  }

  function getSelection() {
    return graph.nodes.filter(x => x.selected && x.type != "final");
  }

  function duplicateSelected() {
    const selected = getSelection();
    if (selected.length != 0) {
      insertSnapshot(snapshotNodes(selected, graph.edges), false);
    }
  }

  function copySelected() {
    copyNodes(getSelection(), graph.edges);
  }

  function cutSelected() {
    const selected = getSelection();
    copyNodes(selected, graph.edges);
    thisFlow?.deleteElements({ nodes: selected });
  }

  function paste() {
    const clipboard = getClipboard();
    if (clipboard) {
      insertSnapshot(clipboard, true);
    }
  }

  function deleteSelected() {
    thisFlow?.deleteElements({ nodes: getSelection() });
  }

  function toggleSelectedCollapsed() {
    graph.nodes.filter(x => x.selected).forEach(x => toggleNodeCollapsed(x.id));
  }

  /**
   * Opens the context menu of the selection. If `node` isn't selected, it becomes the
   * only selected node.
   */
  function openSelectionMenu(ev: React.MouseEvent, node?: VestigeNode) {
    ev.preventDefault();
    ev.stopPropagation();

    if (node && !node.selected) {
      setGraph(mutator.mutate(graph, {
        nodes: graph.nodes.map(x => ({ ...x, selected: x.id == node.id }))
      }));
    }

    setShowCtxMenu(false);
    setSelectionMenuPos({ x: ev.pageX, y: ev.pageY });
  }

  function selectAll() {
    setGraph(mutator.mutate(graph, { nodes: graph.nodes.map(x => ({ ...x, selected: true })) }));
  }

  useEffect(() => {
    function handleKeyDown(ev: KeyboardEvent) {
      if (isTextInput(ev.target))
        return;

      const key = ev.key.toLowerCase();
      const isModifierHeld = ev.ctrlKey || ev.metaKey;

      if (isModifierHeld && !ev.altKey) {
        if (key == ",") {
          settingsDialogRef.current?.showModal();
          ev.preventDefault();
          return;
        }

        // Editing shortcuts shouldn't affect the canvas while a dialog is open.
        if (document.querySelector("dialog[open]") || inTour)
          return;

        const actions: Record<string, () => void> = {
          "c": copySelected,
          "x": cutSelected,
          "v": paste,
          "a": selectAll,
          "d": duplicateSelected
        };

        const action = actions[key];
        if (action && !ev.shiftKey) {
          action();
          ev.preventDefault();
        }

        return;
      }

      if (ev.altKey || document.querySelector("dialog[open]"))
        return;

      if (key == "a" && ev.shiftKey) {
        // We add nodes with Shift+A, just like Blender does.
        setCtxMenuPos(mousePos.current);
        setShowCtxMenu(true);
        ev.preventDefault();
      }
      else if (key == "d" && ev.shiftKey) {
        duplicateSelected();
        ev.preventDefault();
      }
      else if (key == "h" && !ev.shiftKey) {
        toggleSelectedCollapsed();
      }
      else if (key == "escape") {
        setShowCtxMenu(false);
        setSelectionMenuPos(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function saveAsLink() {
    const data = await serializeBase64Project(graph.nodes, graph.edges, VESTIGE_NODE_SERIALIZERS);
    const root = isTauri()
      ? "https://vestige.ascpixi.dev/"
      : location.origin + location.pathname;

    setProjLink(root + "#p:" + data);
  }

  async function saveAsFile() {
    await promptToSaveFile(
      await serializeProject(graph.nodes, graph.edges, VESTIGE_NODE_SERIALIZERS),
      "untitled",
      "Vestige Project",
      "vestigeproj"
    );
  }

  async function loadFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".vestigeproj";
    
    const file = await new Promise<File>(resolve => {
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) resolve(file);
      };

      input.click();
    });

    const data = await new Promise<ArrayBuffer>(resolve => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.readAsArrayBuffer(file);
    });

    const result = await deserializeProject(new Uint8Array(data), VESTIGE_NODE_SERIALIZERS);
    setGraph(graphFromExisting(result.nodes, result.edges));
  }

  function loadFromLink() {
    const link = prompt("Paste the link in the input box below.");
    if (link == null)
      return;

    const linkHashIdx = link.indexOf("#");
    location.hash = link.substring(linkHashIdx);
  }

  function reset() {
    location.hash = "";
    location.reload();
  }

  useEffect(() => {
    if (shouldLoadExisting) 
      return;

    // Load default project
    setTimeout(() => {
      setGraph(mutator.mutate(graph, { nodes: [createFinalNode(0, 0)] }));

      if (shouldShowTour) {
        tourDialogRef.current!.showModal();
      }
    }, 300);
  }, []);

  const onNodesChange = useCallback(
    (changes: flow.NodeChange<VestigeNode>[]) => {
      for (const change of changes) {
        if (change.type == "remove") {
          disposeNode(change.id);
        }
      }

      graph = mutator.mutate(graph, { nodes: flow.applyNodeChanges(changes, graph.nodes) });
      setGraph(graph);

      if (changes.some(x => x.type != "position")) {
        setGraphVer(x => x + 1);
      }
    },
    [graph, mutator],
  );

  const onEdgesChange = useCallback(
    (changes: flow.EdgeChange<flow.Edge>[]) => {
      graph = mutator.mutateEdges(graph, changes);
      setGraph(graph);
      setGraphVer(x => x + 1);
    },
    [graph, mutator]
  );

  const onConnect = useCallback(
    (params: flow.Connection) => {
      // We can't connect two different sources to one target
      if (graph.edges.some(x => x.target == params.target && x.targetHandle == params.targetHandle))
        return;
 
      setGraph(mutator.mutate(graph, {
        edges: flow.addEdge({ ...params, type: "vestige" }, graph.edges)
      }));

      setGraphVer(x => x + 1);
    },
    [graph, mutator]
  );

  useEffect(() => {
    if (playing) {
      const id = setInterval(() => {
        graph.traceGraph((performance.now() - startTimeMs) / 1000);
      }, (1 / 96) * 1000);

      return () => clearInterval(id);
    }
  },
    // We only want to restart the graph tracer task when the graph changes in a meaningful
    // way - `nodes` changes when a node is re-positioned, and we really don't need to reset
    // the interval just for that (we don't care about node positions!) - we instead keep
    // a "graph version" counter, which we increment every time the graph changes in a way
    // that concerns us. We provide it as a dependency.
    [graphVer, startTimeMs, playing]
  );

  const selectedCount = graph.nodes.filter(x => x.selected).length;

  return (
    <HelpContext.Provider value={helpContext}>
      <main
        className="w-screen h-screen overflow-hidden"
        onContextMenu={handleContextMenuOpen}
        onMouseMove={handleMouseMove}
      >
        <AddNodeMenu
          x={ctxMenuPos.x} y={ctxMenuPos.y}
          show={showCtxMenu}
          onClose={() => setShowCtxMenu(false)}
          onNodeChoose={async (descriptor) => {
            const isTouchFallback = ctxMenuPos.x == 1 && ctxMenuPos.y == 1;
            const { x, y } = thisFlow!.screenToFlowPosition(
              isTouchFallback
                ? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
                : ctxMenuPos
            );

            setGraph(mutator.addNode(graph, await descriptor.create(x, y - NEW_NODE_OFFSET)));
            setShowCtxMenu(false);
          }}
        />

        {
          !thisFlow ? <></> :
          <IntroductionTour
            nodes={graph.nodes}
            edges={graph.edges}
            flowState={thisFlow}
            viewport={viewport}
            ref={tourDialogRef}
            tourStateChange={setInTour}
          />
        }

        <SettingsDialog ref={settingsDialogRef} settings={settings} onChange={changeSettings} />

        {
          !selectionMenuPos ? <></> :
          <SelectionMenu
            x={selectionMenuPos.x} y={selectionMenuPos.y}
            title={`${selectedCount} ${selectedCount == 1 ? "node" : "nodes"} selected`}
            canEdit={getSelection().length != 0}
            canPaste={getClipboard() != null}
            onCopy={copySelected}
            onCut={cutSelected}
            onPaste={paste}
            onDuplicate={duplicateSelected}
            onToggleCollapse={toggleSelectedCollapsed}
            onDelete={deleteSelected}
            onClose={() => setSelectionMenuPos(null)}
          />
        }

        <AppProjectLinkDialog link={projLink}/>
        <AppRenderDialog ref={renderDialogRef} graph={graph} />

        <ConfirmationDialog
          ref={resetDialogRef}
          content={<>
            Are you sure you want to create a new project? If you did not save
            this one before, it will be lost forever!
          </>}
          confirm="Yes, create a new one"
          onConfirm={reset}
        />

        <flow.ReactFlow
          onMouseDownCapture={() => {
            setShowCtxMenu(false);
            setSelectionMenuPos(null);
          }}
          onNodeContextMenu={(ev, node) => openSelectionMenu(ev, node)}
          onSelectionContextMenu={ev => openSelectionMenu(ev)}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={VESTIGE_NODE_TYPES}
          edgeTypes={VESTIGE_EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onViewportChange={setViewport}
          defaultViewport={DEFAULT_VIEWPORT}
          onInit={setThisFlow}
          fitView={shouldLoadExisting}
          deleteKeyCode={["Backspace", "Delete"]}
          multiSelectionKeyCode={["Meta", "Control", "Shift"]}
          panOnDrag={settings.panMode == "LEFT" ? true : [1]}
          selectionOnDrag={settings.panMode == "MIDDLE"}
          selectionMode={flow.SelectionMode.Partial}
          panOnScroll={settings.scrollMode == "PAN"}
          zoomOnScroll={settings.scrollMode == "ZOOM"}
          translateExtent={inTour ? [[-1500, -500], [2000, 750]] : undefined}
        >
          <flow.Background variant={flow.BackgroundVariant.Dots}/>
          <flow.Panel position="bottom-right" className="mb-8!">
            <HelpPanel
              page={helpPage}
              open={helpOpen}
              onPageChange={setHelpPage}
              onOpenChange={setHelpOpen}
            />
          </flow.Panel>
          <flow.Controls />
          <flow.Panel position="top-left">
            <nav className="flex gap-2">
              <button onClick={togglePlay}
                title={playing ? "Stop" : "Play"}
                className="btn btn-square bg-white"
              >
                { playing ? <RiStopFill/> : <RiPlayFill/> }
              </button>

              <div className="dropdown">
                <button
                  title="Project"
                  tabIndex={0}
                  role="button"
                  className="btn btn-square bg-white"
                  disabled={inTour}
                >
                  <RiSaveFill/>
                </button>

                <ul tabIndex={0} className="dropdown-content menu bg-white mt-2 rounded-box z-1 w-52 p-2 shadow-sm">
                  <li><a onClick={saveAsFile}><RiFileCheckFill className="w-4"/> Save as file</a></li>
                  <li><a onClick={saveAsLink}><RiLinkM className="w-4"/>Save as link</a></li>
                  <li><a onClick={loadFromFile}><RiImportFill className="w-4"/>Load from file</a></li>
                  <li><a onClick={() => renderDialogRef.current!.showModal()}><RiFileMusicFill className="w-4"/>Render to audio file</a></li>

                  {
                    !isTauri() ? <></> :
                    <li><a onClick={loadFromLink}><RiLinkUnlinkM className="w-4"/>Load from link</a></li>
                  }
                </ul>
              </div>

              <button onClick={() => resetDialogRef.current!.showModal()}
                title="New project"
                className="btn btn-square bg-white"
                disabled={inTour}
              >
                <RiDeleteBinFill/>
              </button>

              <button onClick={() => tourDialogRef.current!.showModal()}
                title="Introduction tour"
                className="btn btn-square bg-white"
                disabled={inTour}
              >
                <RiGraduationCapFill/>
              </button>

              <button onClick={() => settingsDialogRef.current!.showModal()}
                title="Settings"
                className="btn btn-square bg-white"
              >
                <RiSettings3Fill/>
              </button>
            </nav>
          </flow.Panel>
        </flow.ReactFlow>
      </main>
    </HelpContext.Provider>
  );
}
