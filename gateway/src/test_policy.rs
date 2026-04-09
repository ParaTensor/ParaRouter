use unigateway_core::ModelPolicy;

fn main() {
    let p = ModelPolicy::default();
    println!("POLICY DEFAULTS: {:?}", p.default_model);
    println!("MAPPINGS: {:?}", p.model_mapping.len());
}
