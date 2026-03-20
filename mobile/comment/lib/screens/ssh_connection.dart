import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:comment/providers/ssh_config_provider.dart';

class SshConnectionScreen extends StatefulWidget {
  const SshConnectionScreen({super.key});

  @override
  State<SshConnectionScreen> createState() => _SshConnectionScreenState();
}

class _SshConnectionScreenState extends State<SshConnectionScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _hostController;
  late final TextEditingController _portController;
  late final TextEditingController _usernameController;
  late final TextEditingController _passwordController;
  bool _isConnecting = false;

  @override
  void initState() {
    super.initState();
    // Controllers will be initialized in didChangeDependencies
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Get the settings provider
    final settingsProvider = Provider.of<SshConfigProvider>(context);

    // Initialize controllers with current provider values
    _hostController = TextEditingController(text: settingsProvider.sshHost);
    _portController = TextEditingController(text: settingsProvider.sshPort);
    _usernameController = TextEditingController(
      text: settingsProvider.sshUsername,
    );
    _passwordController = TextEditingController(
      text: settingsProvider.sshPassword,
    );
  }

  @override
  void dispose() {
    _hostController.dispose();
    _portController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _connect() {
    if (_formKey.currentState!.validate()) {
      setState(() {
        _isConnecting = true;
      });

      // Update provider with current values (save settings)
      final settingsProvider = Provider.of<SshConfigProvider>(
        context,
        listen: false,
      );
      settingsProvider.updateSshSettings(
        host: _hostController.text,
        port: _portController.text,
        username: _usernameController.text,
        password: _passwordController.text,
      );

      // Simulate connection
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() {
            _isConnecting = false;
          });
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(const SnackBar(content: Text('Connection simulated')));
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SSH Connection')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _hostController,
                decoration: const InputDecoration(
                  labelText: 'Host',
                  hintText: '192.168.1.1',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter a host';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _portController,
                decoration: const InputDecoration(
                  labelText: 'Port',
                  hintText: '22',
                  border: OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _usernameController,
                decoration: const InputDecoration(
                  labelText: 'Username',
                  border: OutlineInputBorder(),
                ),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter a username';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _passwordController,
                decoration: const InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(),
                ),
                obscureText: true,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Please enter a password';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: _isConnecting ? null : _connect,
                  child: _isConnecting
                      ? const SizedBox(
                          height: 24,
                          width: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Connect'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
