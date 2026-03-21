import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

class SearchWindow extends StatefulWidget {
  final bool isOpen;
  final String initialQuery;
  final int resultCount;
  final ValueChanged<String> onChanged;
  final VoidCallback onClose;
  final VoidCallback onSubmit;

  const SearchWindow({
    super.key,
    required this.isOpen,
    required this.initialQuery,
    required this.resultCount,
    required this.onChanged,
    required this.onClose,
    required this.onSubmit,
  });

  @override
  State<SearchWindow> createState() => _SearchWindowState();
}

class _SearchWindowState extends State<SearchWindow>
    with SingleTickerProviderStateMixin {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;
  late final AnimationController _openController;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialQuery);
    _focusNode = FocusNode();
    _openController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
      reverseDuration: const Duration(milliseconds: 220),
      value: widget.isOpen ? 1 : 0,
    );
  }

  @override
  void didUpdateWidget(covariant SearchWindow oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialQuery != _controller.text) {
      _controller.value = TextEditingValue(
        text: widget.initialQuery,
        selection: TextSelection.collapsed(offset: widget.initialQuery.length),
      );
    }
    if (widget.isOpen && !oldWidget.isOpen) {
      _openController.forward();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future<void>.delayed(const Duration(milliseconds: 170), () {
          if (mounted && widget.isOpen) {
            _focusNode.requestFocus();
          }
        });
      });
    } else if (!widget.isOpen && oldWidget.isOpen) {
      _focusNode.unfocus();
      _openController.reverse();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    _openController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final screenSize = media.size;
    final safeTop = media.padding.top;
    final safeBottom = media.padding.bottom;
    final keyboardInset = media.viewInsets.bottom;

    return AnimatedBuilder(
      animation: _openController,
      builder: (context, _) {
        final progress = Curves.easeOutCubic.transform(_openController.value);
        if (progress <= 0.001 && !widget.isOpen) {
          return const SizedBox.shrink();
        }

        final width = lerpDouble(70, screenSize.width - 24, progress)!;
        final height = lerpDouble(70, 58, progress)!;
        final closedTop = screenSize.height - safeBottom - 12 - 70;
        final openTop = (closedTop + 6 - keyboardInset).clamp(
          safeTop + 12,
          screenSize.height,
        );
        final top = lerpDouble(closedTop, openTop, progress)!;
        final left = (screenSize.width - width) / 2;
        final compactIconOpacity = (1 - (progress / 0.5)).clamp(0.0, 1.0);
        final expandedBarOpacity = ((progress - 0.2) / 0.8).clamp(0.0, 1.0);

        return IgnorePointer(
          ignoring: progress < 0.01,
          child: Stack(
            children: [
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: widget.onClose,
                  child: ColoredBox(
                    color: Colors.black.withValues(alpha: 0.26 * progress),
                  ),
                ),
              ),
              Positioned(
                left: left,
                top: top,
                child: GlassContainer(
                  useOwnLayer: true,
                  quality: GlassQuality.standard,
                  width: width,
                  height: height,
                  padding: EdgeInsets.symmetric(
                    horizontal: lerpDouble(0, 12, progress)!,
                    vertical: 8,
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Opacity(
                        opacity: compactIconOpacity,
                        child: const Icon(
                          Icons.search,
                          size: 31,
                          color: Colors.white,
                        ),
                      ),
                      Opacity(
                        opacity: expandedBarOpacity,
                        child: Row(
                          children: [
                            const Icon(
                              Icons.search,
                              size: 20,
                              color: Colors.white70,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Theme(
                                data: Theme.of(context).copyWith(
                                  textSelectionTheme:
                                      const TextSelectionThemeData(
                                        cursorColor: Colors.white,
                                        selectionColor: Colors.white30,
                                        selectionHandleColor: Colors.white,
                                      ),
                                  colorScheme: Theme.of(
                                    context,
                                  ).colorScheme.copyWith(primary: Colors.white),
                                ),
                                child: TextField(
                                  controller: _controller,
                                  focusNode: _focusNode,
                                  onChanged: widget.onChanged,
                                  onSubmitted: (_) => widget.onSubmit(),
                                  textInputAction: TextInputAction.search,
                                  cursorColor: Colors.white,
                                  decoration: const InputDecoration(
                                    isDense: true,
                                    filled: false,
                                    fillColor: Colors.transparent,
                                    border: InputBorder.none,
                                    enabledBorder: InputBorder.none,
                                    focusedBorder: InputBorder.none,
                                    contentPadding: EdgeInsets.zero,
                                    hintText: 'Search',
                                    hintStyle: TextStyle(
                                      color: Colors.white54,
                                      fontSize: 18,
                                    ),
                                  ),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 18,
                                  ),
                                ),
                              ),
                            ),
                            IconButton(
                              style: IconButton.styleFrom(
                                foregroundColor: Colors.white70,
                                overlayColor: Colors.white24,
                              ),
                              visualDensity: VisualDensity.compact,
                              icon: const Icon(Icons.close),
                              onPressed: widget.onClose,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Positioned(
                top: (top - 38).clamp(safeTop + 4, screenSize.height),
                left: 0,
                right: 0,
                child: Opacity(
                  opacity: expandedBarOpacity,
                  child: Center(
                    child: GlassContainer(
                      useOwnLayer: true,
                      quality: GlassQuality.standard,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      child: Text(
                        '${widget.resultCount} result${widget.resultCount == 1 ? '' : 's'}',
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
