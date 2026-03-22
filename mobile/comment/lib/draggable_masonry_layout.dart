import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';

class DraggableMasonryItem {
  final String id;
  final Widget child;

  const DraggableMasonryItem({required this.id, required this.child});
}

class DraggableMasonryLayout extends StatefulWidget {
  final List<DraggableMasonryItem> items;
  final EdgeInsetsGeometry padding;
  final double mainAxisSpacing;
  final double crossAxisSpacing;
  final bool enableDrag;
  final void Function(String draggedId, String targetId) onReorder;
  final void Function(String cardId)? onSamePlaceDrop;

  const DraggableMasonryLayout({
    super.key,
    required this.items,
    required this.onReorder,
    this.onSamePlaceDrop,
    this.padding = const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 104.0),
    this.mainAxisSpacing = 16.0,
    this.crossAxisSpacing = 16.0,
    this.enableDrag = true,
  });

  @override
  State<DraggableMasonryLayout> createState() => _DraggableMasonryLayoutState();
}

class _DraggableMasonryLayoutState extends State<DraggableMasonryLayout> {
  static const double _samePlaceDistanceThreshold = 10.0;

  final Map<String, Size> _itemSizes = <String, Size>{};

  String? _draggingId;
  bool _dropHandled = false;
  Offset? _dragStartGlobal;

  void _resetDragState() {
    _draggingId = null;
    _dropHandled = false;
    _dragStartGlobal = null;
  }

  void _handleDragStarted(String id) {
    _draggingId = id;
    _dropHandled = false;
    _dragStartGlobal = null;
  }

  void _handleDragUpdate(DragUpdateDetails details) {
    _dragStartGlobal ??= details.globalPosition;
  }

  void _handleDragEnd(DraggableDetails details) {
    final draggedId = _draggingId;
    final start = _dragStartGlobal;
    final end = details.offset;

    final shouldTreatAsSamePlace =
        !_dropHandled &&
        draggedId != null &&
        start != null &&
        (end - start).distance <= _samePlaceDistanceThreshold;

    _resetDragState();

    if (shouldTreatAsSamePlace) {
      widget.onSamePlaceDrop?.call(draggedId);
    }
  }

  Widget _buildFeedback(DraggableMasonryItem item, double fallbackTileWidth) {
    final size = _itemSizes[item.id];
    final width = size?.width ?? fallbackTileWidth;
    final height = size?.height;

    final feedbackChild = SizedBox(
      width: width,
      height: height,
      child: item.child,
    );

    return Material(
      type: MaterialType.transparency,
      child: RepaintBoundary(child: feedbackChild),
    );
  }

  Widget _buildTile(
    BuildContext context,
    DraggableMasonryItem item,
    double fallbackTileWidth,
  ) {
    final measuredChild = _MeasureSize(
      onSizeChanged: (size) {
        _itemSizes[item.id] = size;
      },
      child: RepaintBoundary(child: item.child),
    );

    if (!widget.enableDrag) {
      return measuredChild;
    }

    return DragTarget<String>(
      onWillAcceptWithDetails: (_) => true,
      onAcceptWithDetails: (details) {
        final draggedId = details.data;
        _dropHandled = true;

        if (draggedId == item.id) {
          widget.onSamePlaceDrop?.call(draggedId);
          return;
        }

        widget.onReorder(draggedId, item.id);
      },
      builder: (context, candidateData, rejectedData) {
        final showTargetOutline =
            candidateData.isNotEmpty && candidateData.first != item.id;

        final tileChild = Stack(
          fit: StackFit.passthrough,
          children: [
            measuredChild,
            if (showTargetOutline)
              Positioned.fill(
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Theme.of(
                          context,
                        ).colorScheme.primary.withValues(alpha: 0.55),
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );

        final placeholderHeight = _itemSizes[item.id]?.height;
        final placeholder = SizedBox(
          height: placeholderHeight,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: Colors.grey[850]!.withValues(alpha: 0.35),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: Colors.grey[700]!.withValues(alpha: 0.7),
              ),
            ),
          ),
        );

        return LongPressDraggable<String>(
          data: item.id,
          feedback: _buildFeedback(item, fallbackTileWidth),
          dragAnchorStrategy: pointerDragAnchorStrategy,
          maxSimultaneousDrags: widget.enableDrag ? 1 : 0,
          hapticFeedbackOnStart: false,
          onDragStarted: () => _handleDragStarted(item.id),
          onDragUpdate: _handleDragUpdate,
          onDragEnd: _handleDragEnd,
          childWhenDragging: ExcludeSemantics(child: placeholder),
          child: tileChild,
        );
      },
    );
  }

  @override
  void didUpdateWidget(DraggableMasonryLayout oldWidget) {
    super.didUpdateWidget(oldWidget);

    final currentIds = widget.items.map((item) => item.id).toSet();
    _itemSizes.removeWhere((id, _) => !currentIds.contains(id));

    final draggingId = _draggingId;
    if (draggingId != null && !currentIds.contains(draggingId)) {
      _resetDragState();
    }
  }

  @override
  Widget build(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    final crossAxisCount = orientation == Orientation.portrait ? 2 : 3;

    return LayoutBuilder(
      builder: (context, constraints) {
        final resolvedPadding = widget.padding.resolve(
          Directionality.of(context),
        );
        final availableWidth =
            constraints.maxWidth -
            resolvedPadding.left -
            resolvedPadding.right -
            widget.crossAxisSpacing * (crossAxisCount - 1);
        final fallbackTileWidth = availableWidth > 0
            ? availableWidth / crossAxisCount
            : constraints.maxWidth / crossAxisCount;

        return Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: constraints.maxWidth),
            child: MasonryGridView.builder(
              padding: widget.padding,
              physics: const BouncingScrollPhysics(),
              gridDelegate: SliverSimpleGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
              ),
              mainAxisSpacing: widget.mainAxisSpacing,
              crossAxisSpacing: widget.crossAxisSpacing,
              itemCount: widget.items.length,
              itemBuilder: (context, index) {
                final item = widget.items[index];
                return _buildTile(context, item, fallbackTileWidth);
              },
            ),
          ),
        );
      },
    );
  }
}

class _MeasureSize extends StatefulWidget {
  final Widget child;
  final ValueChanged<Size> onSizeChanged;

  const _MeasureSize({required this.child, required this.onSizeChanged});

  @override
  State<_MeasureSize> createState() => _MeasureSizeState();
}

class _MeasureSizeState extends State<_MeasureSize> {
  @override
  Widget build(BuildContext context) {
    return _SizeReportingWidget(
      onSizeChanged: widget.onSizeChanged,
      child: widget.child,
    );
  }
}

class _SizeReportingWidget extends SingleChildRenderObjectWidget {
  final ValueChanged<Size> onSizeChanged;

  const _SizeReportingWidget({
    required this.onSizeChanged,
    required super.child,
  });

  @override
  RenderObject createRenderObject(BuildContext context) {
    return _SizeReportingRenderBox(onSizeChanged);
  }

  @override
  void updateRenderObject(BuildContext context, RenderObject renderObject) {
    final box = renderObject as _SizeReportingRenderBox;
    box.onSizeChanged = onSizeChanged;
  }
}

class _SizeReportingRenderBox extends RenderProxyBox {
  ValueChanged<Size> onSizeChanged;
  Size? _lastSize;

  _SizeReportingRenderBox(this.onSizeChanged);

  @override
  void performLayout() {
    super.performLayout();
    final currentSize = size;
    if (currentSize == _lastSize) {
      return;
    }

    _lastSize = currentSize;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      onSizeChanged(currentSize);
    });
  }
}
