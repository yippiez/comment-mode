import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:liquid_glass_widgets/liquid_glass_widgets.dart';

const _bottomBarButtonSize = 70.0;
const _expandedSearchHeight = 50.0;
const _searchMorphDuration = Duration(milliseconds: 280);

class BottomBar extends StatefulWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onNew;
  final VoidCallback? onSearchOpen;
  final ValueChanged<String>? onSearchChanged;
  final VoidCallback? onSearchClose;
  final VoidCallback? onSearchSubmit;
  final VoidCallback? onArchive;
  final bool isSearchOpen;
  final String searchQuery;

  const BottomBar({
    super.key,
    this.onExtensions,
    this.onNew,
    this.onSearchOpen,
    this.onSearchChanged,
    this.onSearchClose,
    this.onSearchSubmit,
    this.onArchive,
    required this.isSearchOpen,
    required this.searchQuery,
  });

  @override
  State<BottomBar> createState() => _BottomBarState();
}

class _BottomBarState extends State<BottomBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _morphController;
  late final Animation<double> _morphProgress;
  late final TextEditingController _searchController;
  late final FocusNode _searchFocusNode;

  @override
  void initState() {
    super.initState();
    _morphController = AnimationController(
      vsync: this,
      duration: _searchMorphDuration,
      value: widget.isSearchOpen ? 1.0 : 0.0,
    );
    _morphProgress = CurvedAnimation(
      parent: _morphController,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    _searchController = TextEditingController(text: widget.searchQuery);
    _searchFocusNode = FocusNode();

    if (widget.isSearchOpen) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && widget.isSearchOpen) {
          _searchFocusNode.requestFocus();
        }
      });
    }
  }

  @override
  void didUpdateWidget(covariant BottomBar oldWidget) {
    super.didUpdateWidget(oldWidget);

    if (widget.searchQuery != _searchController.text) {
      _searchController.value = TextEditingValue(
        text: widget.searchQuery,
        selection: TextSelection.collapsed(offset: widget.searchQuery.length),
      );
    }

    if (widget.isSearchOpen && !oldWidget.isSearchOpen) {
      _morphController.forward();
      Future<void>.delayed(const Duration(milliseconds: 110), () {
        if (mounted && widget.isSearchOpen) {
          _searchFocusNode.requestFocus();
        }
      });
    } else if (!widget.isSearchOpen && oldWidget.isSearchOpen) {
      _searchFocusNode.unfocus();
      _morphController.reverse();
    }
  }

  @override
  void dispose() {
    _morphController.dispose();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final keyboardInset = MediaQuery.of(context).viewInsets.bottom;

    return AnimatedBuilder(
      animation: _morphProgress,
      builder: (context, child) {
        final paddingProgress = _morphProgress.value;
        final bottomPadding =
            (ui.lerpDouble(32, 0, paddingProgress) ?? 0) +
            (keyboardInset * paddingProgress);

        return SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              bottom: bottomPadding,
            ),
            child: child,
          ),
        );
      },
      child: SizedBox(
        height: _bottomBarButtonSize,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final maxWidth = constraints.maxWidth;
            final slotWidth = maxWidth / 4;
            final collapsedWidth = _bottomBarButtonSize;
            final collapsedLeft = (slotWidth * 2.5) - (collapsedWidth / 2);

            return AnimatedBuilder(
              animation: _morphProgress,
              builder: (context, child) {
                final t = _morphProgress.value;
                final searchLeft = ui.lerpDouble(collapsedLeft, 0, t) ?? 0;
                final searchWidth =
                    ui.lerpDouble(collapsedWidth, maxWidth, t) ?? maxWidth;
                final searchHeight =
                    ui.lerpDouble(
                      _bottomBarButtonSize,
                      _expandedSearchHeight,
                      t,
                    ) ??
                    _expandedSearchHeight;
                final searchTop = (_bottomBarButtonSize - searchHeight) / 2;
                final searchRadius = ui.lerpDouble(36, 24, t) ?? 24;
                final actionsFade =
                    1 - Curves.easeOut.transform((t / 0.35).clamp(0.0, 1.0));
                final actionsScale =
                    ui.lerpDouble(0.94, 1.0, actionsFade) ?? 1.0;
                final fieldReveal = Curves.easeInOut.transform(
                  ((t - 0.2) / 0.8).clamp(0, 1),
                );

                return Stack(
                  children: [
                    IgnorePointer(
                      ignoring: widget.isSearchOpen || actionsFade <= 0.01,
                      child: Opacity(
                        opacity: actionsFade,
                        child: Transform.scale(
                          scale: actionsScale,
                          child: _ActionSlotsRow(
                            onExtensions: widget.onExtensions,
                            onArchive: widget.onArchive,
                            onNew: widget.onNew,
                            searchSlot: const SizedBox(
                              width: _bottomBarButtonSize,
                              height: _bottomBarButtonSize,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Positioned(
                      top: searchTop,
                      left: searchLeft,
                      width: searchWidth,
                      height: searchHeight,
                      child: _MorphingSearchSurface(
                        isOpen: widget.isSearchOpen,
                        progress: t,
                        borderRadius: searchRadius,
                        controller: _searchController,
                        focusNode: _searchFocusNode,
                        onOpen: widget.onSearchOpen,
                        onChanged: widget.onSearchChanged,
                        onClose: widget.onSearchClose,
                        onSubmit: widget.onSearchSubmit,
                        fieldReveal: fieldReveal,
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}

class _ActionSlotsRow extends StatelessWidget {
  final VoidCallback? onExtensions;
  final VoidCallback? onArchive;
  final VoidCallback? onNew;
  final Widget searchSlot;

  const _ActionSlotsRow({
    this.onExtensions,
    this.onArchive,
    this.onNew,
    required this.searchSlot,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Center(
            child: _BottomActionButton(
              icon: const _ExtensionsIcon(),
              label: 'Extensions',
              onTap: onExtensions,
            ),
          ),
        ),
        Expanded(
          child: Center(
            child: _BottomActionButton(
              icon: const Icon(
                Icons.folder_open_outlined,
                size: 31,
                color: Colors.white,
              ),
              label: 'Archive',
              onTap: onArchive,
            ),
          ),
        ),
        Expanded(child: Center(child: searchSlot)),
        Expanded(
          child: Center(
            child: _BottomActionButton(
              icon: const Icon(Icons.add, size: 31, color: Colors.white),
              label: '+ New',
              onTap: onNew,
            ),
          ),
        ),
      ],
    );
  }
}

class _MorphingSearchSurface extends StatefulWidget {
  final bool isOpen;
  final double progress;
  final double borderRadius;
  final TextEditingController controller;
  final FocusNode focusNode;
  final VoidCallback? onOpen;
  final ValueChanged<String>? onChanged;
  final VoidCallback? onClose;
  final VoidCallback? onSubmit;
  final double fieldReveal;

  const _MorphingSearchSurface({
    required this.isOpen,
    required this.progress,
    required this.borderRadius,
    required this.controller,
    required this.focusNode,
    this.onOpen,
    this.onChanged,
    this.onClose,
    this.onSubmit,
    required this.fieldReveal,
  });

  @override
  State<_MorphingSearchSurface> createState() => _MorphingSearchSurfaceState();
}

class _MorphingSearchSurfaceState extends State<_MorphingSearchSurface>
    with SingleTickerProviderStateMixin {
  static const _jellyFadeOutProgress = 0.68;

  late final AnimationController _saturationController;
  late final Animation<double> _saturationAnimation;

  @override
  void initState() {
    super.initState();
    _saturationController = AnimationController(
      duration: const Duration(milliseconds: 50),
      vsync: this,
    );
    _saturationAnimation = CurvedAnimation(
      parent: _saturationController,
      curve: Curves.easeOut,
    );
  }

  @override
  void didUpdateWidget(covariant _MorphingSearchSurface oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.progress >= _jellyFadeOutProgress &&
        oldWidget.progress < _jellyFadeOutProgress) {
      _saturationController.value = 0;
    }
  }

  @override
  void dispose() {
    _saturationController.dispose();
    super.dispose();
  }

  bool get _isJellyInteractive => widget.progress < _jellyFadeOutProgress;

  void _handleTapDown(TapDownDetails details) {
    if (!_isJellyInteractive) {
      return;
    }
    _saturationController.forward();
  }

  void _handleTapUp(TapUpDetails details) {
    _saturationController.reverse();
  }

  void _handleTapCancel() {
    _saturationController.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final iconFade =
        1 - Curves.easeOut.transform((widget.progress / 0.45).clamp(0, 1));
    final horizontalPadding =
        ui.lerpDouble(0, 12, Curves.easeOut.transform(widget.progress)) ?? 12;
    final closeReveal = Curves.easeOut.transform(
      ((widget.progress - 0.45) / 0.55).clamp(0, 1),
    );
    final jellyProgress =
        1 - (widget.progress / _jellyFadeOutProgress).clamp(0.0, 1.0);
    final jellyFactor = Curves.easeOut.transform(jellyProgress);
    final interactionScale = ui.lerpDouble(1.0, 1.05, jellyFactor) ?? 1.0;
    final stretch = ui.lerpDouble(0.0, 0.5, jellyFactor) ?? 0.0;
    final resistance = ui.lerpDouble(0.0, 0.08, jellyFactor) ?? 0.08;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.isOpen ? widget.focusNode.requestFocus : widget.onOpen,
      onTapDown: _isJellyInteractive ? _handleTapDown : null,
      onTapUp: _isJellyInteractive ? _handleTapUp : null,
      onTapCancel: _handleTapCancel,
      child: RepaintBoundary(
        child: LiquidStretch(
          interactionScale: interactionScale,
          stretch: stretch,
          resistance: resistance,
          hitTestBehavior: HitTestBehavior.opaque,
          child: AnimatedBuilder(
            animation: _saturationAnimation,
            builder: (context, child) {
              final glowIntensity = (_saturationAnimation.value * jellyFactor)
                  .clamp(0.0, 1.0);
              return AdaptiveGlass(
                shape: LiquidRoundedSuperellipse(
                  borderRadius: widget.borderRadius,
                ),
                settings: InheritedLiquidGlass.ofOrDefault(context),
                quality: GlassQuality.standard,
                useOwnLayer: true,
                clipBehavior: Clip.antiAlias,
                glowIntensity: glowIntensity,
                child: child!,
              );
            },
            child: SizedBox.expand(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    IgnorePointer(
                      ignoring: widget.isOpen,
                      child: Opacity(
                        opacity: iconFade,
                        child: const Center(
                          child: Icon(
                            Icons.search,
                            size: 31,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                    if (widget.fieldReveal > 0.001)
                      IgnorePointer(
                        ignoring: !widget.isOpen || widget.fieldReveal < 0.75,
                        child: Opacity(
                          opacity: widget.fieldReveal,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.search,
                                size: 24,
                                color: Colors.white70,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Center(
                                  child: Theme(
                                    data: Theme.of(context).copyWith(
                                      textSelectionTheme:
                                          const TextSelectionThemeData(
                                            cursorColor: Colors.white,
                                            selectionColor: Colors.white30,
                                            selectionHandleColor: Colors.white,
                                          ),
                                      colorScheme: Theme.of(context).colorScheme
                                          .copyWith(primary: Colors.white),
                                    ),
                                    child: TextField(
                                      controller: widget.controller,
                                      focusNode: widget.focusNode,
                                      onChanged: widget.onChanged,
                                      onSubmitted: (_) =>
                                          widget.onSubmit?.call(),
                                      textInputAction: TextInputAction.search,
                                      maxLines: 1,
                                      expands: false,
                                      textAlignVertical:
                                          TextAlignVertical.center,
                                      cursorColor: Colors.white,
                                      decoration: const InputDecoration(
                                        filled: false,
                                        fillColor: Colors.transparent,
                                        isDense: true,
                                        isCollapsed: true,
                                        border: InputBorder.none,
                                        enabledBorder: InputBorder.none,
                                        focusedBorder: InputBorder.none,
                                        disabledBorder: InputBorder.none,
                                        errorBorder: InputBorder.none,
                                        focusedErrorBorder: InputBorder.none,
                                        contentPadding: EdgeInsets.symmetric(
                                          vertical: 8,
                                        ),
                                        hintText: 'Search',
                                        hintStyle: TextStyle(
                                          color: Colors.white54,
                                          fontSize: 16,
                                        ),
                                      ),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Opacity(
                                opacity: closeReveal,
                                child: SizedBox(
                                  width: 38,
                                  height: 38,
                                  child: IconButton(
                                    style: IconButton.styleFrom(
                                      foregroundColor: Colors.white70,
                                      overlayColor: Colors.white24,
                                      padding: EdgeInsets.zero,
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                    iconSize: 20,
                                    visualDensity: VisualDensity.compact,
                                    icon: const Icon(Icons.close_rounded),
                                    onPressed: widget.isOpen
                                        ? widget.onClose
                                        : null,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    // WARNING: Keep this as one always-mounted AdaptiveGlass.
                    // Replacing this with separate closed/open glass trees (including
                    // AnimatedSwitcher/IndexedStack branch swaps) can re-create web
                    // shader instances and cause the transparent -> frosted flash.
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomActionButton extends StatelessWidget {
  final Widget icon;
  final String label;
  final VoidCallback? onTap;

  const _BottomActionButton({
    required this.icon,
    required this.label,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassButton.custom(
      width: _bottomBarButtonSize,
      height: _bottomBarButtonSize,
      shape: const LiquidRoundedSuperellipse(borderRadius: 36),
      label: label,
      onTap: onTap ?? () {},
      useOwnLayer: true,
      quality: GlassQuality.standard,
      glowRadius: 1.1,
      child: Center(child: icon),
    );
  }
}

class _ExtensionsIcon extends StatelessWidget {
  const _ExtensionsIcon();

  @override
  Widget build(BuildContext context) {
    const pieceSize = 11.0;
    const gap = 4.0;
    return const SizedBox(
      width: pieceSize * 2 + gap,
      height: pieceSize * 2 + gap,
      child: Stack(
        children: [
          Positioned(left: 0, top: 0, child: _ExtensionsPiece(size: pieceSize)),
          Positioned(
            left: 0,
            top: pieceSize + gap,
            child: _ExtensionsPiece(size: pieceSize),
          ),
          Positioned(
            left: pieceSize + gap,
            top: pieceSize + gap,
            child: _ExtensionsPiece(size: pieceSize),
          ),
        ],
      ),
    );
  }
}

class _ExtensionsPiece extends StatelessWidget {
  final double size;

  const _ExtensionsPiece({required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.white, width: 1.8),
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
